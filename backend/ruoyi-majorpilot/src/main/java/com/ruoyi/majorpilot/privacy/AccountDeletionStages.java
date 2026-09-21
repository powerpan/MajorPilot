package com.ruoyi.majorpilot.privacy;

import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static com.ruoyi.majorpilot.privacy.PrivacyStore.*;

/** Physical deletion topology for V8. Shared content and Operator accounts are never deleted. */
@Service @Profile("local")
public class AccountDeletionStages {
    private final PrivacyStore store;private final PrivateObjectStore files;private final AccountDeletionOwnershipGuard ownership;
    public AccountDeletionStages(PrivacyStore store,PrivateObjectStore files,AccountDeletionOwnershipGuard ownership){this.store=store;this.files=files;this.ownership=ownership;}
    private void requireTransaction(){if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("DELETION_TRANSACTION_REQUIRED");}
    public String execute(long student,String stage){requireTransaction();return switch(stage){
        case "FILES"->{ownership.validate(student);removeFiles(student);yield "METADATA";}
        case "METADATA"->{metadata(student);yield "REPORTS";}
        case "REPORTS"->{reports(student);yield "EVIDENCE";}
        case "EVIDENCE"->{evidence(student);yield "EXPERIENCE";}
        case "EXPERIENCE"->{experience(student);yield "RUNS";}
        case "RUNS"->{runs(student);yield "PROFILES";}
        case "PROFILES"->{profiles(student);yield "ACCOUNT";}
        default->throw new ApiException(503,"DELETION_STAGE_INVALID");
    };}
    private void collectKeys(Set<String> keys,Map<String,Object> job,String prefix){
        var cp=store.node(job.get("checkpoint_json"));var list=cp.path("artifactKeys");
        if(!cp.isObject()||!list.isArray()||list.size()>3)throw new ApiException(503,"DELETION_SOURCE_INVALID");
        for(var value:list){if(!value.isTextual()||!value.asText().matches(prefix+"/[0-7][0-9A-HJKMNP-TV-Z]{25}\\."+(prefix.equals("student")?"zip":"csv")))throw new ApiException(503,"DELETION_SOURCE_INVALID");keys.add(value.asText());}
    }
    private void objectKey(Set<String> keys,Map<String,Object> row,String prefix){
        if(row.get("object_key")==null)return;String key=s(row,"object_key");
        if(!key.matches(prefix+"/[0-7][0-9A-HJKMNP-TV-Z]{25}\\."+(prefix.equals("student")?"zip":"csv")))throw new ApiException(503,"DELETION_SOURCE_INVALID");
        keys.add(key);
    }
    private void validateFileOwners(long student,Set<String> keys,Set<Long> adminIds){
        // JSON artifact pointers are not covered by SQL foreign keys. Resolve every
        // surviving reference before removing any bytes, including stale lease files.
        for(String key:keys){
            for(var e:store.db.queryForList("SELECT student_id FROM mp_student_data_export WHERE object_key=?",key))if(n(e,"student_id")!=student)throw new ApiException(503,"DELETION_SOURCE_INVALID");
            for(var e:store.db.queryForList("SELECT id FROM mp_admin_export WHERE object_key=?",key))if(!adminIds.contains(n(e,"id")))throw new ApiException(503,"DELETION_SOURCE_INVALID");
            for(var j:store.db.queryForList("SELECT job_type,owner_student_id,target_type,target_id FROM mp_background_job WHERE JSON_CONTAINS(JSON_EXTRACT(checkpoint_json,'$.artifactKeys'),JSON_QUOTE(?))=1",key)){
                boolean own="STUDENT_EXPORT".equals(s(j,"job_type"))&&j.get("owner_student_id")!=null&&n(j,"owner_student_id")==student;
                boolean member="ADMIN_EXPORT".equals(s(j,"job_type"))&&"ADMIN_EXPORT".equals(s(j,"target_type"))&&adminIds.contains(n(j,"target_id"));
                if(!own&&!member)throw new ApiException(503,"DELETION_SOURCE_INVALID");
            }
        }
    }
    private void removeFiles(long student){
        Set<String> keys=new LinkedHashSet<>();
        var exports=store.db.queryForList("SELECT object_key FROM mp_student_data_export WHERE student_id=? FOR UPDATE",student);
        for(var e:exports)objectKey(keys,e,"student");
        for(var j:store.db.queryForList("SELECT checkpoint_json FROM mp_background_job WHERE owner_student_id=? AND job_type='STUDENT_EXPORT' FOR UPDATE",student))collectKeys(keys,j,"student");
        var admin=store.db.queryForList("SELECT e.id,e.public_id,e.object_key FROM mp_admin_export e JOIN mp_admin_export_student m ON m.export_id=e.id WHERE m.student_id=? ORDER BY e.id FOR UPDATE",student);
        for(var e:admin){
            objectKey(keys,e,"admin");
            for(var j:store.db.queryForList("SELECT checkpoint_json FROM mp_background_job WHERE job_type='ADMIN_EXPORT' AND target_type='ADMIN_EXPORT' AND target_id=? FOR UPDATE",n(e,"id")))collectKeys(keys,j,"admin");
        }
        validateFileOwners(student,keys,admin.stream().map(e->n(e,"id")).collect(java.util.stream.Collectors.toSet()));
        // Tracking rows remain until every disk removal succeeds. A retry safely re-deletes
        // files already removed before a crash; it never has to guess their names.
        for(String key:keys)files.delete(key);
        for(var e:admin){long id=n(e,"id");
            store.db.update("DELETE FROM mp_idempotency_record WHERE resource_type='ADMIN_EXPORT' AND resource_id=?",id);
            store.db.update("DELETE FROM mp_sensitive_audit WHERE target_type='ADMIN_EXPORT' AND target_public_id=?",s(e,"public_id"));
            store.db.update("DELETE FROM mp_background_job WHERE job_type='ADMIN_EXPORT' AND target_type='ADMIN_EXPORT' AND target_id=?",id);
            store.db.update("DELETE FROM mp_admin_export_student WHERE export_id=?",id);
            store.db.update("DELETE FROM mp_admin_export WHERE id=?",id);
        }
        store.db.update("DELETE FROM mp_student_data_export WHERE student_id=?",student);
        // Export jobs have no evidence-origin relationship; other jobs are removed later.
        store.db.update("DELETE FROM mp_background_job WHERE owner_student_id=? AND job_type='STUDENT_EXPORT'",student);
    }
    private void metadata(long student){
        store.db.update("DELETE e FROM mp_product_event e LEFT JOIN mp_intake_session i ON i.id=e.intake_session_id WHERE e.student_id=? OR i.claimed_student_id=?",student,student);
        store.db.update("DELETE FROM mp_ai_call WHERE student_id=?",student);
        store.db.update("DELETE e FROM mp_idempotency_record e LEFT JOIN mp_intake_session i ON i.id=e.owner_intake_session_id WHERE e.owner_student_id=? OR i.claimed_student_id=?",student,student);
        store.db.update("DELETE FROM mp_security_event WHERE student_id=?",student);
        store.db.update("DELETE FROM mp_sensitive_audit WHERE owner_student_id=?",student);
        // Historical P2/P6 audit records predate an explicit owner column.
        store.db.update("DELETE a FROM mp_sensitive_audit a JOIN mp_experience_run r ON r.public_id=a.target_public_id WHERE r.student_id=? AND a.target_type='EXPERIENCE_RUN'",student);
        store.db.update("DELETE a FROM mp_sensitive_audit a JOIN mp_report r ON r.public_id=a.target_public_id WHERE r.student_id=? AND a.target_type='REPORT'",student);
        store.db.update("DELETE a FROM mp_sensitive_audit a JOIN mp_report_version v ON v.public_id=a.target_public_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=? AND a.target_type='REPORT_VERSION'",student);
        store.db.update("DELETE a FROM mp_sensitive_audit a JOIN mp_student_account s ON s.public_id=a.target_public_id WHERE s.id=? AND a.target_type='STUDENT'",student);
    }
    private void reports(long student){
        store.db.update("UPDATE mp_report SET current_version_id=NULL,generation_target_version_id=NULL WHERE student_id=?",student);
        store.db.update("DELETE c FROM mp_comparison_source c JOIN mp_report_version v ON v.id=c.comparison_report_version_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        store.db.update("DELETE e FROM mp_report_claim_evidence e JOIN mp_report_claim c ON c.id=e.report_claim_id JOIN mp_report_version v ON v.id=c.report_version_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        store.db.update("DELETE c FROM mp_report_claim c JOIN mp_report_version v ON v.id=c.report_version_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        store.db.update("DELETE FROM mp_student_feedback WHERE student_id=?",student);
        store.db.update("DELETE v FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        store.db.update("DELETE FROM mp_report WHERE student_id=?",student);
    }
    private void evidence(long student){
        store.db.update("DELETE i FROM mp_evidence_item i JOIN mp_evidence_snapshot s ON s.id=i.evidence_snapshot_id WHERE s.student_id=?",student);
        store.db.update("DELETE FROM mp_evidence_snapshot WHERE student_id=?",student);
        store.db.update("DELETE FROM mp_background_job WHERE owner_student_id=? AND job_type<>'ACCOUNT_DELETE'",student);
    }
    private void experience(long student){
        store.db.update("DELETE x FROM mp_response_execution x JOIN mp_step_response_revision v ON v.id=x.response_revision_id JOIN mp_step_state s ON s.id=v.step_state_id JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE x FROM mp_execution_record x JOIN mp_experience_run r ON r.id=x.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE x FROM mp_hint_request x JOIN mp_experience_run r ON r.id=x.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE a FROM mp_reflection_answer a JOIN mp_reflection f ON f.id=a.reflection_id JOIN mp_experience_run r ON r.id=f.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE f FROM mp_reflection f JOIN mp_experience_run r ON r.id=f.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE c FROM mp_step_completion c JOIN mp_step_state s ON s.id=c.step_state_id JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE v FROM mp_step_response_revision v JOIN mp_step_state s ON s.id=v.step_state_id JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE s FROM mp_step_state s JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",student);
        store.db.update("DELETE c FROM mp_run_closure_request c JOIN mp_experience_run r ON r.id=c.experience_run_id WHERE r.student_id=?",student);
    }
    private void runs(long student){
        store.db.update("UPDATE mp_recommendation c LEFT JOIN mp_decision_profile p ON p.id=c.decision_profile_id LEFT JOIN mp_intake_session i ON i.id=p.intake_session_id SET c.source_run_id=NULL WHERE c.student_id=? OR p.student_id=? OR i.claimed_student_id=?",student,student,student);
        // A recovery run's CHECK disallows clearing origin_run_id. Delete leaves first.
        while(true){var leaves=store.db.queryForList("SELECT r.id FROM mp_experience_run r LEFT JOIN mp_experience_run c ON c.origin_run_id=r.id WHERE r.student_id=? AND c.id IS NULL LIMIT 1000",Long.class,student);if(leaves.isEmpty())break;for(long id:leaves)store.db.update("DELETE FROM mp_experience_run WHERE id=? AND student_id=?",id,student);}
        if(store.db.queryForObject("SELECT COUNT(*) FROM mp_experience_run WHERE student_id=?",Long.class,student)!=0)throw new ApiException(503,"DELETION_SOURCE_INVALID");
    }
    private void profiles(long student){
        store.db.update("DELETE FROM mp_recommendation_decision WHERE student_id=?",student);
        store.db.update("DELETE x FROM mp_recommendation_reason x JOIN mp_recommendation c ON c.id=x.recommendation_id JOIN mp_decision_profile p ON p.id=c.decision_profile_id LEFT JOIN mp_intake_session i ON i.id=p.intake_session_id WHERE c.student_id=? OR p.student_id=? OR i.claimed_student_id=?",student,student,student);
        store.db.update("DELETE c FROM mp_recommendation c JOIN mp_decision_profile p ON p.id=c.decision_profile_id LEFT JOIN mp_intake_session i ON i.id=p.intake_session_id WHERE c.student_id=? OR p.student_id=? OR i.claimed_student_id=?",student,student,student);
        store.db.update("DELETE a FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id LEFT JOIN mp_intake_session i ON i.id=p.intake_session_id WHERE p.student_id=? OR i.claimed_student_id=?",student,student);
        store.db.update("UPDATE mp_decision_profile p LEFT JOIN mp_intake_session i ON i.id=p.intake_session_id SET p.supersedes_profile_id=NULL WHERE p.student_id=? OR i.claimed_student_id=?",student,student);
        store.db.update("DELETE p FROM mp_decision_profile p LEFT JOIN mp_intake_session i ON i.id=p.intake_session_id WHERE p.student_id=? OR i.claimed_student_id=?",student,student);
        store.db.update("DELETE c FROM mp_consent_record c LEFT JOIN mp_intake_session i ON i.id=c.intake_session_id WHERE c.student_id=? OR i.claimed_student_id=?",student,student);
        store.db.update("DELETE FROM mp_intake_session WHERE claimed_student_id=?",student);
        store.db.update("DELETE FROM mp_student_session WHERE student_id=?",student);
        store.db.update("DELETE FROM mp_email_token WHERE student_id=?",student);
    }
    public void finish(long student,long request,long job){requireTransaction();
        // This transaction is the only point at which COMPLETED may become visible.
        store.db.update("DELETE FROM mp_account_deletion_request WHERE student_id=? AND id<>? AND status='CANCELLED'",student,request);
        store.db.update("DELETE FROM mp_background_job WHERE id=? AND job_type='ACCOUNT_DELETE' AND owner_student_id=? AND target_id=?",job,student,request);
        int changed=store.db.update("UPDATE mp_account_deletion_request SET status='COMPLETED',student_id=NULL,completed_at=UTC_TIMESTAMP(3),receipt_expires_at=LEAST(confirmed_at+INTERVAL 120 DAY,UTC_TIMESTAMP(3)+INTERVAL 90 DAY),current_stage='COMPLETED',failure_code=NULL,last_attempt_at=NULL,row_version=row_version+1 WHERE id=? AND student_id=? AND status='PROCESSING' AND current_stage='ACCOUNT'",request,student);
        if(changed!=1||store.db.update("DELETE FROM mp_student_account WHERE id=? AND status='DELETION_PENDING'",student)!=1)throw new ApiException(503,"DELETION_SOURCE_INVALID");
    }
}
