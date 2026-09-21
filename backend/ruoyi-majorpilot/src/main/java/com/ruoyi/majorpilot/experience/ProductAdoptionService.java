package com.ruoyi.majorpilot.experience;

import com.ruoyi.majorpilot.acceptance.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.report.ReportCoordinator;
import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;

/** Owner-authorized local release and exact historical adoption; never rewrites source facts. */
@Service @Profile("local")
public class ProductAdoptionService {
    public record Release(Long expectedRevision,String manifestSha256,String authorizationReference,String reasonText) {}
    public record Adopt(Long expectedRevision,String closedInputSha256,String evidenceSnapshotId,String authorizationReference,String reasonText) {}
    private final RunService runs;private final RunStore store;private final LocalProductAccess access;
    private final TaskContentRepository repository;private final ClosurePipeline closure;private final ReportCoordinator reports;
    public ProductAdoptionService(RunService runs,LocalProductAccess access,TaskContentRepository repository,ClosurePipeline closure,ReportCoordinator reports){this.runs=runs;this.store=runs.store();this.access=access;this.repository=repository;this.closure=closure;this.reports=reports;}
    static void authorization(String reference,String reason){
        if(reference==null||!reference.matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}")||reason==null||reason.isBlank()||reason.length()>1000)throw new ApiException(422,"AUTHORIZATION_REQUIRED");
    }
    public Map<String,Object> release(String task,Release input,long operator,String request){
        access.requireEnabled();if(input==null||input.expectedRevision()==null||input.manifestSha256()==null)throw new ApiException(422,"VALIDATION_ERROR");authorization(input.authorizationReference(),input.reasonText());
        return runs.transactions().execute(tx->{
            var rows=store.jdbc().queryForList("SELECT t.* FROM mp_task_version t JOIN mp_major m ON m.id=t.major_id WHERE t.public_id=? AND t.content_kind='MAJOR' AND m.status='ACTIVE' FOR UPDATE",task);
            if(rows.size()!=1)throw new ApiException(404,"CONTENT_UNAVAILABLE");var row=rows.getFirst();
            if(n(row,"row_version")!=input.expectedRevision())throw new ApiException(409,"REVISION_CONFLICT");
            if(!"REVIEW".equals(s(row,"status")))throw new ApiException(409,"CONTENT_STATE_CONFLICT");
            var bundle=repository.get(s(row,"manifest_path"));
            if(!input.manifestSha256().equals(s(row,"manifest_sha256"))||!bundle.manifestSha256().equals(input.manifestSha256()))throw new ApiException(409,"CONTENT_VERSION_IMMUTABLE");
            var prior=store.jdbc().queryForList("SELECT * FROM mp_local_task_release WHERE task_version_id=?",n(row,"id"));
            if(!prior.isEmpty()){
                if(!input.manifestSha256().equals(s(prior.getFirst(),"manifest_sha256"))||!input.authorizationReference().equals(s(prior.getFirst(),"authorization_reference")))throw new ApiException(409,"AUTHORIZATION_CONFLICT");
                return map("authorizationId",s(prior.getFirst(),"public_id"),"taskVersionId",task,"reviewStatus","REVIEW","availability","AVAILABLE");
            }
            String id=PublicIds.next();store.jdbc().update("INSERT INTO mp_local_task_release(public_id,task_version_id,manifest_sha256,authority_code,authorization_reference,reason_text,authorized_by_operator_id) VALUES(?,?,?,'PROJECT_OWNER_REQUEST',?,?,?)",id,n(row,"id"),input.manifestSha256(),input.authorizationReference(),input.reasonText(),operator);
            audit(operator,null,"LOCAL_PRODUCT_RELEASE","TASK_VERSION",task,input.reasonText(),request,id);
            return map("authorizationId",id,"taskVersionId",task,"reviewStatus","REVIEW","availability","AVAILABLE");
        });
    }
    public Map<String,Object> adopt(String runId,Adopt input,long operator,String request){
        access.requireEnabled();if(input==null||input.expectedRevision()==null||input.closedInputSha256()==null||input.evidenceSnapshotId()==null)throw new ApiException(422,"VALIDATION_ERROR");authorization(input.authorizationReference(),input.reasonText());
        return runs.transactions().execute(tx->{
            var owners=store.jdbc().queryForList("SELECT student_id FROM mp_experience_run WHERE public_id=?",runId);if(owners.size()!=1)throw new ApiException(404,"RESOURCE_NOT_FOUND");long student=n(owners.getFirst(),"student_id");
            var account=store.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student);if(account.size()!=1||!"ACTIVE".equals(s(account.getFirst(),"status")))throw new ApiException(409,"ACCOUNT_LOCKED");
            var raw=store.jdbc().queryForMap(SELECT+" WHERE r.public_id=? AND r.student_id=? FOR UPDATE",runId,student);var run=store.row(raw);store.revision(run,input.expectedRevision());
            if(!run.kind().equals("MAJOR")||!run.mode().equals("REVIEW_PREVIEW")||!run.status().equals("CLOSED")||run.profileId()==null||run.taskId()==null)throw new ApiException(409,"PRODUCT_ADOPTION_INVALID");
            var frozen=store.node(raw.get("closed_input_manifest_json"));
            if(!input.closedInputSha256().equals(raw.get("closed_input_sha256"))||!input.closedInputSha256().equals(store.hash(frozen))||!runId.equals(frozen.path("runId").asText())||!run.mode().equals(frozen.path("runMode").asText())||!run.taskPublicId().equals(frozen.path("taskVersionId").asText())||run.profileId()!=frozen.path("decisionProfileId").asLong()||!closure.profileHash(run.profileId(),student).equals(frozen.path("profileSha256").asText()))throw new ApiException(409,"EVIDENCE_SOURCE_INVALID");
            var task=runs.contentProvider().pinned(run.taskPublicId());
            if(!task.manifestSha256().equals(frozen.path("taskManifestSha256").asText())||store.jdbc().queryForObject("SELECT COUNT(*) FROM mp_task_version t WHERE t.id=? AND "+LocalProductAccess.pinnedSql("t"),Integer.class,run.taskId())!=1)throw new ApiException(409,"LOCAL_RELEASE_REQUIRED");
            var snapshots=store.jdbc().queryForList("SELECT * FROM mp_evidence_snapshot WHERE public_id=? AND student_id=? AND experience_run_id=? AND task_version_id=? AND decision_profile_id=? AND status='READY' AND run_mode='REVIEW_PREVIEW' AND closed_input_sha256=?",input.evidenceSnapshotId(),student,run.id(),run.taskId(),run.profileId(),input.closedInputSha256());
            if(snapshots.size()!=1)throw new ApiException(409,"EVIDENCE_SOURCE_INVALID");
            if(store.jdbc().queryForObject("SELECT COUNT(*) FROM mp_experience_run r WHERE r.student_id=? AND r.major_id=? AND r.id<>? AND r.status<>'REPLACED' AND "+ProductEligibility.sql("r"),Integer.class,student,run.majorId(),run.id())>0)throw new ApiException(409,"MAJOR_ALREADY_STARTED");
            var prior=store.jdbc().queryForList("SELECT * FROM mp_run_product_adoption WHERE experience_run_id=?",run.id());String authorizationId;
            if(prior.isEmpty()){
                if(store.jdbc().queryForObject("SELECT COUNT(*) FROM mp_experience_run r WHERE r.student_id=? AND r.id<>? AND r.status='CLOSED' AND "+ProductEligibility.sql("r"),Integer.class,student,run.id())>0)throw new ApiException(409,"PRODUCT_ADOPTION_ORDER_CONFLICT");
                authorizationId=PublicIds.next();store.jdbc().update("INSERT INTO mp_run_product_adoption(public_id,student_id,experience_run_id,task_version_id,decision_profile_id,task_manifest_sha256,closed_input_sha256,original_run_mode,authority_code,authorization_reference,reason_text,authorized_by_operator_id) VALUES(?,?,?,?,?,?,?,'REVIEW_PREVIEW','PROJECT_OWNER_REQUEST',?,?,?)",authorizationId,student,run.id(),run.taskId(),run.profileId(),task.manifestSha256(),input.closedInputSha256(),input.authorizationReference(),input.reasonText(),operator);
                audit(operator,student,"PRODUCT_RUN_ADOPT","EXPERIENCE_RUN",runId,input.reasonText(),request,authorizationId);
            }else{
                var authorization=ProductEligibility.authorization(store.jdbc(),student,run.id());
                if(authorization==null||!input.authorizationReference().equals(s(authorization,"authorization_reference")))throw new ApiException(409,"AUTHORIZATION_CONFLICT");
                authorizationId=s(authorization,"public_id");
            }
            var reflection=store.jdbc().queryForMap("SELECT id,row_version,question_set_version,draft_json FROM mp_reflection WHERE experience_run_id=? AND status='SUBMITTED'",run.id());
            var answers=store.node(reflection.get("draft_json"));
            if(n(reflection,"id")!=frozen.path("reflectionId").asLong()||n(reflection,"row_version")!=frozen.path("reflectionRevision").asLong()||!store.hash(answers).equals(frozen.path("reflectionSha256").asText())||!s(reflection,"question_set_version").equals(task.manifest().path("reflection").path("questionSetVersion").asText()))throw new ApiException(409,"EVIDENCE_SOURCE_INVALID");
            closure.initializeAdoption(run,answers);
            reports.initializeAuthorizedRun(run.id(),n(snapshots.getFirst(),"id"));
            var report=store.jdbc().queryForMap("SELECT public_id,status FROM mp_report WHERE experience_run_id=?",run.id());
            return map("authorizationId",authorizationId,"runId",runId,"originalRunMode",run.mode(),"productEligible",true,"reportId",s(report,"public_id"),"reportStatus",s(report,"status"));
        });
    }
    private void audit(long operator,Long student,String action,String type,String id,String reason,String request,String authorization){store.jdbc().update("INSERT INTO mp_sensitive_audit(public_id,operator_id,owner_student_id,action_code,target_type,target_public_id,reason_code,reason_text,before_summary_json,after_summary_json,correlation_id) VALUES(?,?,?,?,?,?,'PROJECT_OWNER_REQUEST',?,'{}',?,?)",PublicIds.next(),operator,student,action,type,id,reason,store.json(Map.of("authorizationId",authorization)),request);}
}
