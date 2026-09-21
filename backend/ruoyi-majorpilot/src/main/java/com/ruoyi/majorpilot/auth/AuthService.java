package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.intake.IntakeClaimPort;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
@Service @Profile("local")
public class AuthService {
    private final JdbcTemplate jdbc;private final TransactionTemplate tx;private final IntakeClaimPort intake;private final IdempotencyService idem;
    private final StudentPasswords passwords;private final StudentSessions sessions;private final RateLimits limits;private final AuthMailGateway mail;private final SecurityEvents audit;private final Secrets secrets;private final ProductEvents events;
    public AuthService(JdbcTemplate jdbc,TransactionTemplate tx,IntakeClaimPort intake,IdempotencyService idem,StudentPasswords passwords,StudentSessions sessions,RateLimits limits,AuthMailGateway mail,SecurityEvents audit,Secrets secrets,ProductEvents events) { this.jdbc=jdbc;this.tx=tx;this.intake=intake;this.idem=idem;this.passwords=passwords;this.sessions=sessions;this.limits=limits;this.mail=mail;this.audit=audit;this.secrets=secrets;this.events=events; }
    public AuthDtos.Registered register(AuthDtos.Register body,String intakeHash,String key,String source,String requestId) {
        String email=AuthInputs.email(body.email());AuthInputs.newPassword(body.password());validateConsents(body.consents());
        limits.require("register-ip",source,10,Duration.ofHours(1));limits.require("register-email",email,5,Duration.ofHours(1));
        String passwordHash=passwords.hash(body.password());AtomicReference<String> outgoing=new AtomicReference<>();AtomicReference<Long> outgoingStudent=new AtomicReference<>();
        AuthDtos.RegistrationIdentity registered;
        try { registered=tx.execute(status->{
            var claimable=intake.lockClaimable(body.intakeSessionId(),intakeHash);
            return idem.execute(new IdempotencyService.Owner(null,claimable.intakeInternalId(),"intake:"+claimable.intakeInternalId()),"POST","/api/public/v1/auth/register",key,body,AuthDtos.RegistrationIdentity.class,()->{
                String publicId=PublicIds.next();
                jdbc.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash) VALUES(?,?,?,?)",publicId,email,body.email().trim(),passwordHash);
                long studentId=jdbc.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,publicId);
                intake.claimAll(claimable.intakeInternalId(),studentId);
                for(var consent:body.consents()) jdbc.update("INSERT INTO mp_consent_record(student_id,intake_session_id,document_type,document_version,decision) VALUES(?,?,?,?,?)",studentId,claimable.intakeInternalId(),consent.documentType(),consent.documentVersion(),consent.decision());
                jdbc.update("UPDATE mp_idempotency_record SET owner_student_id=? WHERE owner_intake_session_id=?",studentId,claimable.intakeInternalId());
                outgoing.set(issueEmailToken(studentId,"VERIFY_EMAIL",source));outgoingStudent.set(studentId);audit.record(studentId,"REGISTRATION_COMPLETED",source,requestId);
                events.record(studentId,claimable.intakeInternalId(),null,"student.registration.completed",Map.of("questionnaireVersion",claimable.questionnaireVersion(),"acquisitionChannelCode",claimable.acquisitionChannelCode()));
                return new AuthDtos.RegistrationIdentity(publicId,"PENDING_VERIFICATION","VERIFY_EMAIL");
            }).data();
        }); } catch(DuplicateKeyException duplicate) { throw new ApiException(409,"EMAIL_ALREADY_REGISTERED"); }
        boolean delivered=outgoing.get()!=null&&mail.send(outgoingStudent.get(),"VERIFY_EMAIL",outgoing.get());
        return new AuthDtos.Registered(registered.studentId(),registered.status(),registered.nextAction(),delivered?"SENT":"RETRY_REQUIRED");
    }
    public AuthDtos.LoginResult login(AuthDtos.Login body,String source,String requestId) {
        String email;try{email=AuthInputs.email(body.email());}catch(ApiException invalid){email="invalid";}
        limits.require("login-ip",source,60,Duration.ofMinutes(15));limits.require("login-email",email,15,Duration.ofMinutes(15));final String normalized=email;
        Object result=tx.execute(status->{
            var rows=jdbc.queryForList("SELECT * FROM mp_student_account WHERE email_normalized=? FOR UPDATE",normalized);
            Map<String,Object> account=rows.isEmpty()?null:rows.getFirst();boolean matches=passwords.matches(body.password(),account==null?null:(String)account.get("password_hash"));
            if(account==null)return new ApiException(401,"AUTH_INVALID");long id=number(account,"id");
            String state=(String)account.get("status");Instant locked=account.get("locked_until")==null?null:DbTimes.instant(account.get("locked_until"));Instant now=Instant.now();
            boolean lockedNow=state.equals("LOCKED")&&(locked==null||locked.isAfter(now));
            if(!matches) {
                boolean expiredTemporaryLock=state.equals("LOCKED")&&locked!=null&&!locked.isAfter(now);
                int failures=expiredTemporaryLock?1:((Number)account.get("failed_login_count")).intValue()+1;
                if(!Set.of("DELETED","DELETION_PENDING").contains(state)&&!lockedNow) {
                    String nextState=failures>=10?"LOCKED":expiredTemporaryLock?(account.get("email_verified_at")==null?"PENDING_VERIFICATION":"ACTIVE"):state;
                    jdbc.update("UPDATE mp_student_account SET failed_login_count=?,status=?,locked_until=? WHERE id=?",failures,nextState,failures>=10?Timestamp.from(now.plusSeconds(900)):null,id);
                    if(failures>=10){sessions.revokeAll(id,"SECURITY_LOCK");audit.record(id,"ACCOUNT_LOCKED",source,requestId);}
                }
                return new ApiException(401,"AUTH_INVALID");
            }
            if(lockedNow)return new ApiException(403,"ACCOUNT_LOCKED");
            if(Set.of("DELETED","DELETION_PENDING").contains(state))return new ApiException(401,"AUTH_INVALID");
            String active=account.get("email_verified_at")==null?"PENDING_VERIFICATION":"ACTIVE";
            jdbc.update("UPDATE mp_student_account SET status=?,failed_login_count=0,locked_until=NULL,last_login_at=? WHERE id=?",active,Timestamp.from(now),id);
            String secret=sessions.issue(id);audit.record(id,"LOGIN_SUCCEEDED",source,requestId);
            return new AuthDtos.LoginResult(new AuthDtos.Me((String)account.get("public_id"),(String)account.get("email_display"),active,active.equals("ACTIVE"),active.equals("ACTIVE")),secret);
        });
        if(result instanceof ApiException failure)throw failure;return (AuthDtos.LoginResult)result;
    }
    public AuthDtos.Me me(StudentPrincipal student) {
        var account=jdbc.queryForMap("SELECT public_id,email_display,status,email_verified_at FROM mp_student_account WHERE id=?",student.internalId());
        boolean verified=account.get("email_verified_at")!=null;String status=(String)account.get("status");
        return new AuthDtos.Me((String)account.get("public_id"),(String)account.get("email_display"),status,verified,status.equals("ACTIVE")&&verified);
    }
    public void requestMail(AuthDtos.Email body,String purpose,String source,String requestId) {
        String email;try{email=AuthInputs.email(body.email());}catch(ApiException invalid){email="invalid";}
        limits.require("mail-ip",source,20,Duration.ofHours(1));limits.require("mail-email",email,3,Duration.ofHours(1));
        final String normalized=email;AtomicReference<Long> outgoingStudent=new AtomicReference<>();String token=tx.execute(status->{
            var rows=jdbc.queryForList("SELECT * FROM mp_student_account WHERE email_normalized=? FOR UPDATE",normalized);
            if(rows.isEmpty())return null;var account=rows.getFirst();String state=(String)account.get("status");
            if(Set.of("DELETED","DELETION_PENDING").contains(state)||("LOCKED".equals(state)&&account.get("locked_until")==null))return null;
            if(purpose.equals("VERIFY_EMAIL")&&account.get("email_verified_at")!=null)return null;
            long id=number(account,"id");outgoingStudent.set(id);audit.record(id,purpose+"_REQUESTED",source,requestId);return issueEmailToken(id,purpose,source);
        });
        if(token!=null)mail.sendAsync(outgoingStudent.get(),purpose,token);
    }
    public void verify(String token,String source,String requestId) { limits.require("email-token-ip",source,30,Duration.ofMinutes(15));consume(token,"VERIFY_EMAIL",null,source,requestId); }
    public void reset(AuthDtos.Reset body,String source,String requestId) { limits.require("email-token-ip",source,30,Duration.ofMinutes(15));String hash=passwords.hash(body.newPassword());consume(body.token(),"RESET_PASSWORD",hash,source,requestId); }
    private void consume(String token,String purpose,String passwordHash,String source,String requestId) {
        if(token==null||!token.matches("[A-Za-z0-9_-]{43}"))throw new ApiException(422,"EMAIL_TOKEN_INVALID");
        tx.executeWithoutResult(status->{
            var candidate=jdbc.queryForList("SELECT student_id FROM mp_email_token WHERE token_hash=? AND purpose=?",Secrets.hash(token),purpose);
            if(candidate.isEmpty())throw new ApiException(422,"EMAIL_TOKEN_INVALID");long id=number(candidate.getFirst(),"student_id");
            var account=jdbc.queryForMap("SELECT * FROM mp_student_account WHERE id=? FOR UPDATE",id);
            var rows=jdbc.queryForList("SELECT id FROM mp_email_token WHERE token_hash=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",Secrets.hash(token),purpose);
            if(rows.isEmpty()||Set.of("DELETED","DELETION_PENDING").contains(account.get("status")))throw new ApiException(422,"EMAIL_TOKEN_INVALID");
            if("LOCKED".equals(account.get("status"))&&account.get("locked_until")==null)throw new ApiException(422,"EMAIL_TOKEN_INVALID");
            jdbc.update("UPDATE mp_email_token SET used_at=UTC_TIMESTAMP(3) WHERE id=?",number(rows.getFirst(),"id"));
            jdbc.update("UPDATE mp_email_token SET revoked_at=UTC_TIMESTAMP(3) WHERE student_id=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL",id,purpose);
            if(purpose.equals("VERIFY_EMAIL"))jdbc.update("UPDATE mp_student_account SET email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP(3)),status=CASE WHEN status='PENDING_VERIFICATION' THEN 'ACTIVE' ELSE status END WHERE id=?",id);
            else { jdbc.update("UPDATE mp_student_account SET password_hash=?,failed_login_count=0,locked_until=NULL,status=CASE WHEN email_verified_at IS NULL THEN 'PENDING_VERIFICATION' ELSE 'ACTIVE' END WHERE id=?",passwordHash,id);sessions.revokeAll(id,"PASSWORD_RESET"); }
            audit.record(id,purpose+"_COMPLETED",source,requestId);
            if(purpose.equals("VERIFY_EMAIL")&&account.get("email_verified_at")==null) { long elapsed=Duration.between(DbTimes.instant(account.get("created_at")),Instant.now()).toSeconds();events.record(id,null,null,"student.email.verified",Map.of("elapsedBucket",elapsed<3600?"UNDER_1_HOUR":elapsed<86400?"UNDER_1_DAY":"OVER_1_DAY")); }
        });
    }
    private String issueEmailToken(long id,String purpose,String source) {
        String token=Secrets.random();jdbc.update("UPDATE mp_email_token SET revoked_at=UTC_TIMESTAMP(3) WHERE student_id=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL",id,purpose);
        jdbc.update("INSERT INTO mp_email_token(student_id,purpose,token_hash,expires_at,request_ip_hash) VALUES(?,?,?,?,?)",id,purpose,Secrets.hash(token),Timestamp.from(Instant.now().plusSeconds(purpose.equals("VERIFY_EMAIL")?86400:1800)),secrets.hmac("source",source));return token;
    }
    public List<Map<String,Object>> consents(StudentPrincipal student) { var rows=jdbc.queryForList("SELECT document_type AS documentType,document_version AS documentVersion,decision,decided_at AS decidedAt FROM mp_consent_record WHERE student_id=? ORDER BY id",student.internalId());for(var row:rows)row.put("decidedAt",DbTimes.instant(row.get("decidedAt")));return rows; }
    public void withdrawResearch(StudentPrincipal student,String source,String requestId) {
        tx.executeWithoutResult(status->{
            jdbc.queryForObject("SELECT id FROM mp_student_account WHERE id=? FOR UPDATE",Long.class,student.internalId());
            var latest=jdbc.queryForList("SELECT decision FROM mp_consent_record WHERE student_id=? AND document_type='RESEARCH' ORDER BY id DESC LIMIT 1",String.class,student.internalId());
            if(!latest.isEmpty()&&latest.getFirst().equals("WITHDRAWN"))return;
            jdbc.update("INSERT INTO mp_consent_record(student_id,document_type,document_version,decision) VALUES(?,'RESEARCH','v1','WITHDRAWN')",student.internalId());
            audit.record(student.internalId(),"RESEARCH_WITHDRAWN",source,requestId);
        });
    }
    private void validateConsents(List<AuthDtos.Consent> consents) {
        if(consents==null||consents.size()<2||consents.size()>3)throw new ApiException(422,"CONSENT_REQUIRED");Set<String> types=new HashSet<>();
        for(var consent:consents) {
            if(consent==null||consent.documentType()==null||consent.decision()==null||!Set.of("TERMS","PRIVACY","RESEARCH").contains(consent.documentType())||!types.add(consent.documentType())||!"v1".equals(consent.documentVersion())||!Set.of("ACCEPTED","DECLINED").contains(consent.decision())||(!consent.documentType().equals("RESEARCH")&&!consent.decision().equals("ACCEPTED")))throw new ApiException(422,"CONSENT_REQUIRED");
        }
        if(!types.containsAll(Set.of("TERMS","PRIVACY")))throw new ApiException(422,"CONSENT_REQUIRED");
    }
    private static long number(Map<String,Object> row,String name) { return ((Number)row.get(name)).longValue(); }
}
