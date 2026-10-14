package com.ruoyi.majorpilot.privacy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.shared.*;
import jakarta.annotation.PreDestroy;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.privacy.PrivacyStore.*;

/** Durable, fenced workers. HTTP acceptance never implies completion of deletion. */
@Service @Profile({"local","pilot"})
public class PrivacyJobs {
    public record Lease(long job,long student,long target,String type,long generation,String worker){}
    private final PrivacyStore store;private final PrivateObjectStore files;private final PersonalExportWriter writer;private final AccountDeletionStages deletion;
    private final String worker="privacy-"+UUID.randomUUID();private final AtomicBoolean busy=new AtomicBoolean();
    private final ExecutorService executor=Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"majorpilot-privacy");t.setDaemon(true);return t;});
    private final ScheduledExecutorService pulse=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"majorpilot-privacy-heartbeat");t.setDaemon(true);return t;});
    public PrivacyJobs(PrivacyStore store,PrivateObjectStore files,PersonalExportWriter writer,AccountDeletionStages deletion){this.store=store;this.files=files;this.writer=writer;this.deletion=deletion;}
    @PreDestroy public void stop(){executor.shutdownNow();pulse.shutdownNow();}
    @Scheduled(fixedDelay=3000) public void tick(){if(!busy.compareAndSet(false,true))return;executor.execute(()->{try{var l=claim(worker);if(l!=null)process(l);}finally{busy.set(false);}});}
    private static String table(String type){return switch(type){case "ACCOUNT_DELETE"->"mp_account_deletion_request";case "STUDENT_EXPORT"->"mp_student_data_export";default->throw new IllegalArgumentException("PRIVACY_JOB_TYPE_INVALID");};}
    private static String targetType(String type){return type.equals("ACCOUNT_DELETE")?"ACCOUNT_DELETION_REQUEST":"STUDENT_DATA_EXPORT";}
    public Lease claim(String workerId){
        var candidates=store.db.queryForList("SELECT id,job_type,owner_student_id,target_id FROM mp_background_job WHERE job_type IN ('ACCOUNT_DELETE','STUDENT_EXPORT') AND owner_student_id IS NOT NULL AND owner_operator_id IS NULL AND ((status IN ('PENDING','RETRY_WAIT') AND available_at<=UTC_TIMESTAMP(3)) OR (status='RUNNING' AND lease_until<=UTC_TIMESTAMP(3))) ORDER BY (job_type='ACCOUNT_DELETE') DESC,available_at,id LIMIT 20");
        for(var c:candidates){var lease=store.tx.execute(tx->{
            long student=n(c,"owner_student_id"),job=n(c,"id"),target=n(c,"target_id");String type=s(c,"job_type");
            var accounts=store.db.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student);if(accounts.isEmpty())return null;
            var targets=store.db.queryForList("SELECT * FROM "+table(type)+" WHERE id=? AND student_id=? FOR UPDATE",target,student);
            var rows=store.db.queryForList("SELECT * FROM mp_background_job WHERE id=? AND job_type=? AND owner_student_id=? AND owner_operator_id IS NULL AND ((status IN ('PENDING','RETRY_WAIT') AND available_at<=UTC_TIMESTAMP(3)) OR (status='RUNNING' AND lease_until<=UTC_TIMESTAMP(3))) FOR UPDATE SKIP LOCKED",job,type,student);
            if(rows.isEmpty())return null;var j=rows.getFirst();
            boolean deleting=type.equals("ACCOUNT_DELETE");String account=s(accounts.getFirst(),"status");
            if(targets.isEmpty()||!(deleting?account.equals("DELETION_PENDING"):Set.of("ACTIVE","PENDING_VERIFICATION").contains(account))){store.db.update("UPDATE mp_background_job SET status='CANCELLED',last_error_code='PRIVACY_TARGET_STALE',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",job);return null;}
            var t=targets.getFirst();String prefix=deleting?"account-delete:":"student-export:";
            if(!targetType(type).equals(s(j,"target_type"))||n(j,"target_id")!=target||j.get("target_version")==null||n(j,"target_version")!=1||!(prefix+s(t,"public_id")).equals(s(j,"business_key"))){store.db.update("UPDATE mp_background_job SET status='FAILED',last_error_code='PRIVACY_SOURCE_INVALID',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",job);store.db.update("UPDATE "+table(type)+" SET status='FAILED',failure_code='PRIVACY_SOURCE_INVALID' WHERE id=?",target);return null;}
            if(!(deleting?Set.of("CONFIRMED","PROCESSING","FAILED"):Set.of("REQUESTED","PROCESSING")).contains(s(t,"status"))){store.db.update("UPDATE mp_background_job SET status='CANCELLED',last_error_code='PRIVACY_TARGET_STALE',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",job);return null;}
            if(!deleting&&n(j,"attempt_count")>=3){terminalExport(job,target,"EXPORT_RETRY_EXHAUSTED");return null;}
            long generation=n(j,"lease_version")+1;
            store.db.update("UPDATE mp_background_job SET status='RUNNING',attempt_count=attempt_count+1,worker_id=?,lease_version=?,lease_until=UTC_TIMESTAMP(3)+INTERVAL 60 SECOND,started_at=COALESCE(started_at,UTC_TIMESTAMP(3)) WHERE id=?",workerId,generation,job);
            store.db.update("UPDATE "+table(type)+" SET status='PROCESSING',failure_code=NULL,row_version=row_version+1"+(deleting?",last_attempt_at=UTC_TIMESTAMP(3)":"")+" WHERE id=?",target);
            return new Lease(job,student,target,type,generation,workerId);
        });if(lease!=null)return lease;}return null;
    }
    boolean validLease(Lease l,boolean lock){return !store.db.queryForList("SELECT id FROM mp_background_job WHERE id=? AND job_type=? AND owner_student_id=? AND owner_operator_id IS NULL AND target_type=? AND target_id=? AND target_version=1 AND status='RUNNING' AND worker_id=? AND lease_version=? AND lease_until>UTC_TIMESTAMP(3)"+(lock?" FOR UPDATE":""),l.job,l.type,l.student,targetType(l.type),l.target,l.worker,l.generation).isEmpty();}
    public boolean heartbeat(Lease l){return store.db.update("UPDATE mp_background_job SET lease_until=UTC_TIMESTAMP(3)+INTERVAL 60 SECOND WHERE id=? AND job_type=? AND owner_student_id=? AND owner_operator_id IS NULL AND target_type=? AND target_id=? AND target_version=1 AND status='RUNNING' AND worker_id=? AND lease_version=? AND lease_until>UTC_TIMESTAMP(3)",l.job,l.type,l.student,targetType(l.type),l.target,l.worker,l.generation)==1;}
    private Map<String,Object> target(Lease l){store.account(l.student,l.type.equals("ACCOUNT_DELETE"));var rows=store.db.queryForList("SELECT * FROM "+table(l.type)+" WHERE id=? AND student_id=? FOR UPDATE",l.target,l.student);if(rows.isEmpty()||!"PROCESSING".equals(s(rows.getFirst(),"status")))throw new ApiException(409,"PRIVACY_TARGET_STALE");return rows.getFirst();}
    public void process(Lease l){
        AtomicBoolean alive=new AtomicBoolean(true);var beat=pulse.scheduleAtFixedRate(()->{try{if(!heartbeat(l))alive.set(false);}catch(RuntimeException unavailable){alive.set(false);}},20,20,TimeUnit.SECONDS);
        try{if(!heartbeat(l))return;if(l.type.equals("ACCOUNT_DELETE")){for(int i=0;i<8&&alive.get();i++)if(deleteStage(l))break;}else export(l,alive);}
        catch(ApiException rejected){fail(l,rejected.code);}catch(RuntimeException failed){fail(l,"PRIVACY_PROCESSING_FAILED");}finally{beat.cancel(false);}
    }
    private void export(Lease l,AtomicBoolean alive){
        String key="student/"+PublicIds.next()+".zip";boolean published=false;
        try{
            Boolean reserved=store.tx.execute(tx->{target(l);if(!validLease(l,true))return false;var cp=store.node(store.db.queryForObject("SELECT checkpoint_json FROM mp_background_job WHERE id=?",String.class,l.job));if(!cp.isObject())throw new ApiException(409,"PRIVACY_SOURCE_INVALID");var keys=((ObjectNode)cp).withArray("artifactKeys");if(keys.size()>=3)throw new ApiException(409,"PRIVACY_SOURCE_INVALID");keys.add(key);store.db.update("UPDATE mp_background_job SET checkpoint_json=? WHERE id=?",store.json(cp),l.job);return true;});
            if(!Boolean.TRUE.equals(reserved))return;
            published=Boolean.TRUE.equals(store.tx.execute(tx->{
                var row=target(l);if(!alive.get()||!validLease(l,false))return false;
                byte[] data=writer.build(l.student,s(row,"scope"),Instant.now());
                // Serializes the local file write with deletion confirmation/cleanup.
                var object=files.write(key,data);
                if(!alive.get()||!validLease(l,true))throw new ApiException(409,"PRIVACY_LEASE_LOST");
                store.db.update("UPDATE mp_student_data_export SET status='READY',object_key=?,file_sha256=?,file_size_bytes=?,completed_at=UTC_TIMESTAMP(3),expires_at=UTC_TIMESTAMP(3)+INTERVAL 24 HOUR,failure_code=NULL,row_version=row_version+1 WHERE id=?",object.key(),object.sha256(),object.size(),l.target);
                store.db.update("UPDATE mp_background_job SET status='SUCCEEDED',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",l.job);return true;
            }));
        }finally{if(!published)files.delete(key);}
    }
    /** Each committed stage is a restart point. The last stage removes the job itself. */
    public boolean deleteStage(Lease l){if(!l.type.equals("ACCOUNT_DELETE"))throw new IllegalArgumentException("PRIVACY_JOB_TYPE_INVALID");return Boolean.TRUE.equals(store.tx.execute(tx->{
        var request=target(l);if(!validLease(l,false))return true;
        String stage=s(request,"current_stage");
        if(stage.equals("ACCOUNT")){
            if(!validLease(l,true))throw new ApiException(409,"PRIVACY_LEASE_LOST");
            deletion.finish(l.student,l.target,l.job);return true;
        }
        String next=deletion.execute(l.student,stage);
        if(!validLease(l,true))throw new ApiException(409,"PRIVACY_LEASE_LOST");
        store.db.update("UPDATE mp_account_deletion_request SET current_stage=?,last_attempt_at=UTC_TIMESTAMP(3),failure_code=NULL,row_version=row_version+1 WHERE id=?",next,l.target);
        return false;
    }));}
    public void fail(Lease l,String code){
        String safe=code!=null&&code.matches("[A-Z][A-Z0-9_]{0,79}")?code:"PRIVACY_PROCESSING_FAILED";
        try{store.tx.executeWithoutResult(tx->{target(l);if(!validLease(l,true))return;
            long attempt=store.db.queryForObject("SELECT attempt_count FROM mp_background_job WHERE id=?",Long.class,l.job);
            if(l.type.equals("ACCOUNT_DELETE")){
                store.db.update("UPDATE mp_account_deletion_request SET status='FAILED',failure_code=?,last_attempt_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",safe,l.target);
                store.db.update("UPDATE mp_background_job SET status='RETRY_WAIT',last_error_code=?,lease_until=NULL,available_at=UTC_TIMESTAMP(3)+INTERVAL ? SECOND WHERE id=?",safe,Math.min(3600,Math.max(5,attempt*30)),l.job);
            }else if(attempt>=3||Set.of("PERSONAL_EXPORT_SOURCE_INVALID","PERSONAL_EXPORT_TOO_LARGE","PRIVACY_SOURCE_INVALID").contains(safe))terminalExport(l.job,l.target,safe);
            else store.db.update("UPDATE mp_background_job SET status='RETRY_WAIT',last_error_code=?,lease_until=NULL,available_at=UTC_TIMESTAMP(3)+INTERVAL IF(attempt_count=1,5,30) SECOND WHERE id=?",safe,l.job);
        });}catch(ApiException removed){/* Confirmed deletion already revoked this worker's authority. */}
    }
    private void terminalExport(long job,long target,String code){store.db.update("UPDATE mp_student_data_export SET status='FAILED',failure_code=?,completed_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",code,target);store.db.update("UPDATE mp_background_job SET status='FAILED',last_error_code=?,lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",code,job);}
}
