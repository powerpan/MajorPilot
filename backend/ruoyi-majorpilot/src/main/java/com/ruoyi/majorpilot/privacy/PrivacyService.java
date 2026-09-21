package com.ruoyi.majorpilot.privacy;

import com.ruoyi.majorpilot.auth.StudentPasswords;
import com.ruoyi.majorpilot.auth.StudentSessions;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.privacy.PrivacyStore.*;

/** Request-side privacy transactions. No file generation, model call or deletion runs in an HTTP request. */
@Service @Profile("local")
public class PrivacyService {
    private final PrivacyStore store;private final IdempotencyService idem;private final RateLimits limits;
    private final StudentPasswords passwords;private final StudentSessions sessions;private final PrivateObjectStore files;
    public PrivacyService(PrivacyStore store,IdempotencyService idem,RateLimits limits,StudentPasswords passwords,StudentSessions sessions,PrivateObjectStore files){this.store=store;this.idem=idem;this.limits=limits;this.passwords=passwords;this.sessions=sessions;this.files=files;}
    private IdempotencyService.Owner owner(StudentPrincipal p){return new IdempotencyService.Owner(p.internalId(),null,"student:"+p.internalId());}
    public PrivacyDtos.ExportStatus requestExport(StudentPrincipal p,PrivacyDtos.ExportRequest request,String key){
        if(request==null||!Set.of("REPORTS_ONLY","FULL_PERSONAL_EXPORT").contains(request.scope()==null?"":request.scope()))throw new ApiException(422,"EXPORT_SCOPE_INVALID");
        limits.require("personal-export",p.publicId(),10,Duration.ofDays(1));
        return idem.execute(owner(p),"POST","/api/app/v1/data-export-requests",key,request,PrivacyDtos.ExportStatus.class,()->{
            store.account(p.internalId(),false);
            if(store.db.queryForObject("SELECT COUNT(*) FROM mp_student_data_export WHERE student_id=? AND status IN ('REQUESTED','PROCESSING')",Integer.class,p.internalId())>=2)throw new ApiException(409,"EXPORT_IN_PROGRESS");
            String id=PublicIds.next();store.db.update("INSERT INTO mp_student_data_export(public_id,student_id,scope) VALUES(?,?,?)",id,p.internalId(),request.scope());
            var row=store.export(p.internalId(),id);store.enqueue("STUDENT_EXPORT","student-export:"+id,p.internalId(),"STUDENT_DATA_EXPORT",n(row,"id"));return PrivacyStore.exportStatus(row,Instant.now());
        }).data();
    }
    public PrivacyDtos.ExportStatus exportStatus(StudentPrincipal p,String id){return store.tx.execute(tx->{store.account(p.internalId(),false);return PrivacyStore.exportStatus(store.export(p.internalId(),id),Instant.now());});}
    public List<PrivacyDtos.ExportStatus> exports(StudentPrincipal p){return store.tx.execute(tx->{store.account(p.internalId(),false);return store.db.queryForList("SELECT * FROM mp_student_data_export WHERE student_id=? ORDER BY id DESC LIMIT 20",p.internalId()).stream().map(r->PrivacyStore.exportStatus(r,Instant.now())).toList();});}
    public byte[] download(StudentPrincipal p,String id){
        return store.tx.execute(tx->{
            store.account(p.internalId(),false);var row=store.export(p.internalId(),id);
            if(!"READY".equals(row.get("status"))||t(row,"expires_at")==null||!t(row,"expires_at").isAfter(Instant.now()))throw missing();
            try{byte[] bytes=files.read(s(row,"object_key"));if(bytes.length!=n(row,"file_size_bytes")||!Secrets.equal(sha(bytes),s(row,"file_sha256")))throw new IllegalStateException();return bytes;}
            catch(RuntimeException unavailable){throw new ApiException(503,"EXPORT_FILE_UNAVAILABLE");}
        });
    }
    PrivacyDtos.IssuedDeletion requestDeletion(StudentPrincipal p,String key){
        limits.require("deletion-request",p.publicId(),10,Duration.ofDays(1));AtomicReference<String> secret=new AtomicReference<>();
        var result=idem.execute(owner(p),"POST","/api/app/v1/account-deletion-requests",key,Map.of(),PrivacyDtos.DeletionStatus.class,()->{
            store.account(p.internalId(),false);Instant now=Instant.now();
            store.db.update("UPDATE mp_account_deletion_request SET status='CANCELLED',current_stage='EXPIRED_UNCONFIRMED',row_version=row_version+1 WHERE student_id=? AND status='REQUESTED' AND receipt_expires_at<=?",p.internalId(),stamp(now));
            var active=store.db.queryForList("SELECT * FROM mp_account_deletion_request WHERE student_id=? AND status IN ('REQUESTED','CONFIRMED','PROCESSING','FAILED') FOR UPDATE",p.internalId());
            String cookie=Secrets.random();secret.set(cookie);
            if(active.isEmpty()){
                String id=PublicIds.next();store.db.update("INSERT INTO mp_account_deletion_request(public_id,student_id,receipt_id,receipt_secret_hash,receipt_expires_at) VALUES(?,?,?,?,?)",id,p.internalId(),PublicIds.next(),Secrets.hash(cookie),stamp(now.plus(Duration.ofDays(7))));return PrivacyStore.deletionStatus(store.deletion(p.internalId(),id));
            }
            var row=active.getFirst();if(!"REQUESTED".equals(row.get("status")))throw new ApiException(409,"DELETION_ALREADY_CONFIRMED");
            // Reissuing a pre-confirmation receipt is authorized only by the same live Student session.
            store.db.update("UPDATE mp_account_deletion_request SET receipt_secret_hash=? WHERE id=?",Secrets.hash(cookie),n(row,"id"));return PrivacyStore.deletionStatus(row);
        });
        if(secret.get()==null){ // The raw cookie is intentionally absent from the durable idempotency response.
            secret.set(store.tx.execute(tx->{store.account(p.internalId(),false);var row=store.deletion(p.internalId(),result.data().requestId());if(!"REQUESTED".equals(row.get("status"))||!t(row,"receipt_expires_at").isAfter(Instant.now()))throw missing();String value=Secrets.random();store.db.update("UPDATE mp_account_deletion_request SET receipt_secret_hash=? WHERE id=?",Secrets.hash(value),n(row,"id"));return value;}));
        }
        return new PrivacyDtos.IssuedDeletion(result.data(),secret.get());
    }
    public PrivacyDtos.DeletionStatus deletionStatus(StudentPrincipal p,String id){return store.tx.execute(tx->{store.account(p.internalId(),false);return PrivacyStore.deletionStatus(store.deletion(p.internalId(),id));});}
    public PrivacyDtos.DeletionStatus confirmDeletion(StudentPrincipal p,String id,PrivacyDtos.DeletionConfirm request,String key){
        PrivacyStore.id(id);if(request==null)throw new ApiException(422,"VALIDATION_ERROR");
        limits.require("deletion-confirm",p.publicId(),5,Duration.ofMinutes(15));
        return idem.execute(owner(p),"POST","/api/app/v1/account-deletion-requests/"+id+"/confirm",key,request,PrivacyDtos.DeletionStatus.class,()->{
            var account=store.account(p.internalId(),false);if(!passwords.matches(request.currentPassword(),s(account,"password_hash")))throw new ApiException(422,"CURRENT_PASSWORD_INVALID");
            var row=store.deletion(p.internalId(),id);Instant now=Instant.now();if(!"REQUESTED".equals(row.get("status"))||!t(row,"receipt_expires_at").isAfter(now))throw missing();
            store.db.update("UPDATE mp_student_account SET status='DELETION_PENDING',deletion_requested_at=?,row_version=row_version+1 WHERE id=?",stamp(now),p.internalId());
            sessions.revokeAll(p.internalId(),"ACCOUNT_DELETION");store.db.update("UPDATE mp_email_token SET revoked_at=? WHERE student_id=? AND revoked_at IS NULL",stamp(now),p.internalId());
            store.db.update("UPDATE mp_student_data_export SET status='EXPIRED',expires_at=?,row_version=row_version+1 WHERE student_id=?",stamp(now),p.internalId());
            store.db.update("UPDATE mp_admin_export e JOIN mp_admin_export_student m ON m.export_id=e.id SET e.status='REVOKED',e.expires_at=?,e.row_version=e.row_version+1 WHERE m.student_id=?",stamp(now),p.internalId());
            store.db.update("UPDATE mp_background_job SET status='CANCELLED',completed_at=?,last_error_code='ACCOUNT_DELETION',lease_version=lease_version+1,lease_until=NULL WHERE owner_student_id=? AND job_type<>'ACCOUNT_DELETE' AND status IN ('PENDING','RUNNING','RETRY_WAIT')",stamp(now),p.internalId());
            store.db.update("UPDATE mp_account_deletion_request SET status='CONFIRMED',confirmed_at=?,scheduled_for=?,receipt_expires_at=?,current_stage='FILES',row_version=row_version+1 WHERE id=?",stamp(now),stamp(now),stamp(now.plus(Duration.ofDays(120))),n(row,"id"));
            store.enqueue("ACCOUNT_DELETE","account-delete:"+id,p.internalId(),"ACCOUNT_DELETION_REQUEST",n(row,"id"));
            return PrivacyStore.deletionStatus(store.deletion(p.internalId(),id));
        }).data();
    }
    public PrivacyDtos.Receipt receipt(String receiptId,String secret){
        id(receiptId);if(secret==null||!secret.matches("[A-Za-z0-9_-]{43}"))throw missing();
        var rows=store.db.queryForList("SELECT status,requested_at,confirmed_at,scheduled_for,completed_at,receipt_expires_at,receipt_secret_hash FROM mp_account_deletion_request WHERE receipt_id=?",receiptId);
        if(rows.isEmpty())throw missing();var row=rows.getFirst();if(!Secrets.equal(Secrets.hash(secret),s(row,"receipt_secret_hash"))||!t(row,"receipt_expires_at").isAfter(Instant.now())||"CANCELLED".equals(row.get("status")))throw missing();
        String state=switch(s(row,"status")){case "REQUESTED"->"REQUESTED";case "COMPLETED"->"COMPLETED";case "FAILED"->"ACTION_REQUIRED";default->"PROCESSING";};
        if(!state.equals("COMPLETED")&&t(row,"confirmed_at")!=null&&!t(row,"confirmed_at").plus(Duration.ofDays(30)).isAfter(Instant.now()))state="ACTION_REQUIRED";
        return new PrivacyDtos.Receipt(state,t(row,"requested_at"),t(row,"confirmed_at"),t(row,"scheduled_for"),t(row,"completed_at"),t(row,"receipt_expires_at"));
    }
    static String sha(byte[] bytes){try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception unavailable){throw new IllegalStateException("EXPORT_HASH_UNAVAILABLE");}}
}
