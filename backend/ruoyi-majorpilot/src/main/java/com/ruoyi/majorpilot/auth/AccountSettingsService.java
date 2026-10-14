package com.ruoyi.majorpilot.auth;

import com.ruoyi.majorpilot.privacy.PrivacyDtos;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Secrets remain in memory/hashed token rows, never idempotency responses or events. */
@Service @Profile({"local","pilot"})
public class AccountSettingsService {
    private final JdbcTemplate jdbc;private final TransactionTemplate tx;private final StudentPasswords passwords;
    private final StudentSessions sessions;private final RateLimits limits;private final AuthMailGateway mail;
    private final SecurityEvents audit;private final Secrets secrets;private final ProductEvents events;
    public AccountSettingsService(JdbcTemplate jdbc,TransactionTemplate tx,StudentPasswords passwords,StudentSessions sessions,
            RateLimits limits,AuthMailGateway mail,SecurityEvents audit,Secrets secrets,ProductEvents events) {
        this.jdbc=jdbc;this.tx=tx;this.passwords=passwords;this.sessions=sessions;this.limits=limits;this.mail=mail;this.audit=audit;this.secrets=secrets;this.events=events;
    }
    public void requestEmail(StudentPrincipal student,PrivacyDtos.EmailChange input,String source,String requestId) {
        if(input==null)throw new ApiException(422,"VALIDATION_ERROR");String email=AuthInputs.email(input.newEmail());
        throttle(student,"email-change",source);limits.require("email-change-target",email,3,Duration.ofHours(1));
        AtomicReference<String> outgoing=new AtomicReference<>();
        ApiException failure=tx.execute(status->{
            var account=lock(student);if(!passwords.matches(input.currentPassword(),(String)account.get("password_hash")))return badPassword(student,source,requestId);
            // Repeating a request always revokes its predecessor, even for an unavailable target.
            revokeTokens(student.internalId(),"CHANGE_EMAIL");
            var occupied=jdbc.queryForList("SELECT id FROM mp_student_account WHERE email_normalized=?",email);
            audit.record(student.internalId(),"EMAIL_CHANGE_REQUESTED",source,requestId);
            if(!occupied.isEmpty())return null; // Same safe 202, no account enumeration.
            String token=Secrets.random();
            jdbc.update("INSERT INTO mp_email_token(student_id,purpose,token_hash,target_email_normalized,target_email_display,expires_at,request_ip_hash) VALUES(?,'CHANGE_EMAIL',?,?,?,?,?)",
                    student.internalId(),Secrets.hash(token),email,input.newEmail().trim(),Timestamp.from(Instant.now().plusSeconds(1800)),secrets.hmac("source",source));
            outgoing.set(token);return null;
        });
        if(failure!=null)throw failure;
        if(outgoing.get()!=null)mail.sendAsync(student.internalId(),"CHANGE_EMAIL",outgoing.get());
    }
    public void confirmEmail(StudentPrincipal student,PrivacyDtos.EmailConfirm input,String source,String requestId) {
        throttle(student,"email-confirm",source);
        if(input==null||input.token()==null||!input.token().matches("[A-Za-z0-9_-]{43}"))throw tokenInvalid();
        try { tx.executeWithoutResult(status->{
            var account=lock(student);
            var rows=jdbc.queryForList("SELECT id,target_email_normalized,target_email_display FROM mp_email_token WHERE student_id=? AND token_hash=? AND purpose='CHANGE_EMAIL' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",student.internalId(),Secrets.hash(input.token()));
            if(rows.isEmpty())throw tokenInvalid();var token=rows.getFirst();
            String email=(String)token.get("target_email_normalized"),display=(String)token.get("target_email_display");
            if(email==null||display==null||!validStoredEmail(email,display))throw tokenInvalid();
            if(!jdbc.queryForList("SELECT id FROM mp_student_account WHERE email_normalized=? AND id<>?",email,student.internalId()).isEmpty())throw tokenInvalid();
            // The original verification anchor remains stable across address changes.
            jdbc.update("UPDATE mp_student_account SET email_normalized=?,email_display=?,email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP(3)),status='ACTIVE',failed_login_count=0,locked_until=NULL,row_version=row_version+1 WHERE id=?",email,display,student.internalId());
            jdbc.update("UPDATE mp_email_token SET used_at=UTC_TIMESTAMP(3) WHERE id=?",((Number)token.get("id")).longValue());
            revokeAll(student.internalId(),"EMAIL_CHANGED");audit.record(student.internalId(),"EMAIL_CHANGE_COMPLETED",source,requestId);
            if(account.get("email_verified_at")==null){long elapsed=Duration.between(DbTimes.instant(account.get("created_at")),Instant.now()).toSeconds();events.record(student.internalId(),null,null,"student.email.verified",Map.of("elapsedBucket",elapsed<3600?"UNDER_1_HOUR":elapsed<86400?"UNDER_1_DAY":"OVER_1_DAY"));}
        }); }catch(DuplicateKeyException unavailable) { throw tokenInvalid(); }
    }
    public void changePassword(StudentPrincipal student,PrivacyDtos.PasswordChange input,String source,String requestId) {
        if(input==null)throw new ApiException(422,"VALIDATION_ERROR");AuthInputs.newPassword(input.newPassword());
        throttle(student,"password-change",source);
        ApiException failure=tx.execute(status->{
            var account=lock(student);if(!passwords.matches(input.currentPassword(),(String)account.get("password_hash")))return badPassword(student,source,requestId);
            String hash=passwords.hash(input.newPassword());
            jdbc.update("UPDATE mp_student_account SET password_hash=?,failed_login_count=0,locked_until=NULL,row_version=row_version+1 WHERE id=?",hash,student.internalId());
            revokeAll(student.internalId(),"PASSWORD_CHANGED");audit.record(student.internalId(),"PASSWORD_CHANGE_COMPLETED",source,requestId);return null;
        });
        if(failure!=null)throw failure;
    }
    private void throttle(StudentPrincipal student,String operation,String source) {
        // Redis counters are outside SQL transactions: password failures cannot roll them back.
        limits.require("account-settings-ip",source,30,Duration.ofMinutes(15));
        limits.require("account-settings-student","student:"+student.internalId(),10,Duration.ofMinutes(15));
        limits.require(operation+"-student","student:"+student.internalId(),5,Duration.ofMinutes(15));
    }
    private Map<String,Object> lock(StudentPrincipal student) {
        var rows=jdbc.queryForList("SELECT public_id,status,password_hash,email_verified_at,created_at FROM mp_student_account WHERE id=? FOR UPDATE",student.internalId());
        if(rows.isEmpty()||!student.publicId().equals(rows.getFirst().get("public_id")))throw new ApiException(401,"SESSION_EXPIRED");
        var account=rows.getFirst();if("LOCKED".equals(account.get("status")))throw new ApiException(403,"ACCOUNT_LOCKED");
        if(!Set.of("ACTIVE","PENDING_VERIFICATION").contains(account.get("status")))throw new ApiException(401,"SESSION_EXPIRED");return account;
    }
    private ApiException badPassword(StudentPrincipal student,String source,String requestId) {
        audit.record(student.internalId(),"ACCOUNT_SETTINGS_PASSWORD_REJECTED",source,requestId);
        // Return from transaction, then throw: the safe rejection audit must commit.
        return new ApiException(422,"CURRENT_PASSWORD_INVALID");
    }
    private void revokeAll(long studentId,String reason) {
        sessions.revokeAll(studentId,reason);
        jdbc.update("UPDATE mp_email_token SET revoked_at=UTC_TIMESTAMP(3) WHERE student_id=? AND used_at IS NULL AND revoked_at IS NULL",studentId);
    }
    private void revokeTokens(long studentId,String purpose) { jdbc.update("UPDATE mp_email_token SET revoked_at=UTC_TIMESTAMP(3) WHERE student_id=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL",studentId,purpose); }
    private static boolean validStoredEmail(String normalized,String display) { try{return AuthInputs.email(display).equals(normalized);}catch(ApiException invalid){return false;} }
    private static ApiException tokenInvalid() { return new ApiException(422,"EMAIL_TOKEN_INVALID"); }
}
