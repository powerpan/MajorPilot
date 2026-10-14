package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.ruoyi.majorpilot.integration.ai.MethodReportGateway;
import com.ruoyi.majorpilot.learning.MethodReportContract;
import com.ruoyi.majorpilot.shared.*;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import static com.ruoyi.majorpilot.experience.RunStore.*;

/** Durable three-request ceiling. Unknown in-flight calls are never silently repeated after restart. */
@Service @Profile({"local","pilot"})
public class MethodReportWorker {
    private com.ruoyi.majorpilot.pilot.ReportAllowances allowances;
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    public void allowances(com.ruoyi.majorpilot.pilot.ReportAllowances value){allowances=value;}
    private final RunStore db;private final TransactionTemplate tx;private final MethodReports reports;private final MethodReportGateway gateway;
    private final String worker="method-"+PublicIds.next();private final AtomicBoolean busy=new AtomicBoolean();private final ExecutorService executor=Executors.newSingleThreadExecutor(Thread.ofVirtual().factory());
    record Lease(long job,long student,long version,long token){}
    public MethodReportWorker(RunStore db,TransactionTemplate tx,MethodReports reports,MethodReportGateway gateway){this.db=db;this.tx=tx;this.reports=reports;this.gateway=gateway;}
    @PreDestroy public void close(){executor.shutdownNow();}
    @Scheduled(fixedDelay=3000) public void tick(){if(!busy.compareAndSet(false,true))return;executor.execute(()->{try{var lease=claim();if(lease!=null)process(lease);}finally{busy.set(false);}});}
    Lease claim(){
        var rows=db.jdbc().queryForList("SELECT id,owner_student_id FROM mp_background_job WHERE job_type='METHOD_REPORT' AND ((status='PENDING' AND available_at<=UTC_TIMESTAMP(3)) OR (status='RUNNING' AND lease_until<UTC_TIMESTAMP(3))) ORDER BY id LIMIT 10");
        for(var candidate:rows){var lease=tx.execute(t->{long student=n(candidate,"owner_student_id");var accounts=db.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student);if(accounts.size()!=1||!s(accounts.getFirst(),"status").equals("ACTIVE"))return null;
            var jobs=db.jdbc().queryForList("SELECT * FROM mp_background_job WHERE id=? AND job_type='METHOD_REPORT' AND ((status='PENDING' AND available_at<=UTC_TIMESTAMP(3)) OR (status='RUNNING' AND lease_until<UTC_TIMESTAMP(3))) FOR UPDATE SKIP LOCKED",n(candidate,"id"));if(jobs.isEmpty())return null;var j=jobs.getFirst();
            long token=n(j,"lease_version")+1;db.jdbc().update("UPDATE mp_background_job SET status='RUNNING',lease_version=?,worker_id=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 16 MINUTE),started_at=COALESCE(started_at,UTC_TIMESTAMP(3)),attempt_count=attempt_count+1 WHERE id=?",token,worker,n(j,"id"));return new Lease(n(j,"id"),student,n(j,"target_id"),token);});if(lease!=null)return lease;
        }return null;
    }
    boolean fence(Lease l){var a=db.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",l.student);if(a.size()!=1||!s(a.getFirst(),"status").equals("ACTIVE"))return false;return db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_background_job j JOIN mp_report_version v ON v.id=j.target_id JOIN mp_report r ON r.id=v.report_id WHERE j.id=? AND j.owner_student_id=? AND j.lease_version=? AND j.worker_id=? AND j.status='RUNNING' AND j.lease_until>UTC_TIMESTAMP(3) AND j.job_type='METHOD_REPORT' AND j.target_type='REPORT_VERSION' AND v.id=? AND v.schema_version='method-report-v1' AND v.status='GENERATING' AND r.generation_target_version_id=v.id AND r.student_id=j.owner_student_id",Integer.class,l.job,l.student,l.token,worker,l.version)==1;}
    Map<String,Object> version(Lease l){return db.jdbc().queryForMap("SELECT * FROM mp_report_version WHERE id=?",l.version);}
    public void process(Lease l){
        try{
            var v=version(l);var input=db.node(v.get("input_manifest_json"));verify(input,v,l.student);
            String phase=s(v,"generation_phase");
            if(Set.of("INITIAL_REQUESTED","REPAIR_REQUESTED","REVIEW_REQUESTED").contains(phase)){fail(l,"METHOD_CALL_OUTCOME_UNKNOWN");return;}
            JsonNode draft=db.node(v.get("draft_proposal_json"));
            if(phase.equals("PREPARED")){
                draft=invoke(l,input,null,"INITIAL");if(draft==null)return;
                if(!MethodReportContract.validate(input,draft).isEmpty()){draft=invoke(l,input,draft,"REPAIR");if(draft==null)return;}
                if(!MethodReportContract.validate(input,draft).isEmpty()){fail(l,"METHOD_DRAFT_INVALID");return;}
                final JsonNode saved=draft;if(!Boolean.TRUE.equals(tx.execute(t->{if(!fence(l))return false;db.jdbc().update("UPDATE mp_report_version SET draft_proposal_json=?,draft_proposal_sha256=?,generation_phase='DRAFT_READY' WHERE id=?",db.json(saved),db.hash(saved),l.version);return true;})))return;
            } else if(!phase.equals("DRAFT_READY")){fail(l,"METHOD_PHASE_INVALID");return;}
            v=version(l);if(draft.isNull()||!db.hash(draft).equals(s(v,"draft_proposal_sha256"))||!MethodReportContract.validate(input,draft).isEmpty()){fail(l,"METHOD_DRAFT_INVALID");return;}
            JsonNode reviewed=invoke(l,input,draft,"REVIEW");if(reviewed==null)return;
            if(!MethodReportContract.validate(input,reviewed).isEmpty()){fail(l,"METHOD_REVIEW_INVALID");return;}
            publish(l,input,reviewed);
        }catch(Exception e){fail(l,e instanceof ApiException a?a.code:"METHOD_GENERATION_FAILED");}
    }
    private JsonNode invoke(Lease l,JsonNode input,JsonNode draft,String stage){
        if(!gateway.enabled()){fail(l,"METHOD_MODEL_NOT_CONFIGURED");return null;}
        String invocation=PublicIds.next();
        boolean started=Boolean.TRUE.equals(tx.execute(t->{if(!fence(l))return false;var v=version(l);if(n(v,"http_attempt_count")>=3)throw new ApiException(409,"METHOD_REQUEST_LIMIT");
            String expected=stage.equals("INITIAL")?"PREPARED":stage.equals("REPAIR")?"INITIAL_REQUESTED":"DRAFT_READY";if(!s(v,"generation_phase").equals(expected))throw new ApiException(409,"METHOD_PHASE_INVALID");
            if(allowances!=null)allowances.started(l.student,s(v,"public_id"));
            db.jdbc().update("UPDATE mp_report_version SET generation_phase=?,http_attempt_count=http_attempt_count+1,external_started_at=COALESCE(external_started_at,UTC_TIMESTAMP(3)),external_deadline_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE),model=? WHERE id=?",stage.equals("INITIAL")?"INITIAL_REQUESTED":stage.equals("REPAIR")?"REPAIR_REQUESTED":"REVIEW_REQUESTED",gateway.model(),l.version);
            db.jdbc().update("UPDATE mp_background_job SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 16 MINUTE) WHERE id=?",l.job);
            db.jdbc().update("INSERT INTO mp_ai_call(public_id,student_id,call_kind,provider,model,prompt_version,input_schema_version,input_sha256,input_field_keys_json,status,duration_ms,http_attempts,repair_attempts,report_version_id,invocation_id,generation_stage,thinking_enabled) VALUES(?,?,'REPORT',?,?,?,'method-report-input-v1',?,'[\"originalInput\",\"untrustedDraft\"]','IN_PROGRESS',0,1,?,?,?, ?,TRUE)",invocation,l.student,gateway.provider(),gateway.model(),MethodReportContract.PROMPT,db.hash(input),stage.equals("REPAIR")?1:0,l.version,invocation,stage);
            if(stage.equals("REVIEW"))db.jdbc().update("UPDATE mp_report_version SET review_invocation_id=?,review_input_sha256=?,review_source_manifest_sha256=? WHERE id=?",invocation,db.hash(db.mapper().valueToTree(map("originalInput",input,"untrustedDraft",draft))),db.hash(input),l.version);return true;}));
        if(!started)return null;
        var result=gateway.call(input,draft,stage.equals("REVIEW"));
        boolean saved=Boolean.TRUE.equals(tx.execute(t->{if(!fence(l))return false;db.jdbc().update("UPDATE mp_ai_call SET status=?,duration_ms=?,input_tokens=?,output_tokens=?,reasoning_tokens=?,error_code=? WHERE invocation_id=? AND student_id=?",result.error()==null?"SUCCEEDED":"FAILED",result.durationMs(),result.inputTokens(),result.outputTokens(),result.reasoningTokens(),result.error(),invocation,l.student);return true;}));
        if(!saved)return null;if(result.error()!=null){fail(l,"METHOD_MODEL_"+result.error());return null;}return result.body();
    }
    private void verify(JsonNode input,Map<String,Object> version,long student){
        if(!MethodReportContract.PROMPT.equals(s(version,"prompt_version")))throw new ApiException(409,"REPORT_SOURCE_INVALID");
        if(!db.hash(input).equals(s(version,"source_manifest_sha256"))||!input.path("schemaVersion").asText().equals("method-report-input-v1"))throw new ApiException(409,"REPORT_SOURCE_INVALID");
        var request=db.node(version.get("request_manifest_json"));
        if(!db.hash(request).equals(s(version,"request_manifest_sha256"))||!request.path("inputSha256").asText().equals(db.hash(input))||!request.path("reportVersionId").asText().equals(s(version,"public_id"))||!request.path("reviewRequired").asBoolean())throw new ApiException(409,"REPORT_SOURCE_INVALID");
        var report=db.jdbc().queryForMap("SELECT public_id,report_type FROM mp_report WHERE id=? AND student_id=?",n(version,"report_id"),student);
        if(!request.path("reportId").asText().equals(s(report,"public_id"))||!input.path("reportType").asText().equals(s(report,"report_type")))throw new ApiException(409,"REPORT_SOURCE_INVALID");
        var jobs=db.jdbc().queryForList("SELECT checkpoint_json FROM mp_background_job WHERE job_type='METHOD_REPORT' AND target_type='REPORT_VERSION' AND target_id=? AND owner_student_id=?",n(version,"id"),student);
        if(jobs.size()!=1||!db.node(jobs.getFirst().get("checkpoint_json")).path("inputSha256").asText().equals(db.hash(input)))throw new ApiException(409,"REPORT_SOURCE_INVALID");
        if(!input.path("runs").isArray()||input.path("runs").size()<1||input.path("runs").size()>3)throw new ApiException(409,"REPORT_SOURCE_INVALID");
        for(var source:input.path("runs")){
            var sourceReport=source.path("sourceReport");
            if(input.path("reportType").asText().equals("EXPERIENCE")){if(!sourceReport.isNull())throw new ApiException(409,"REPORT_SOURCE_INVALID");}
            else if(sourceReport.isNull()||db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_report_version v JOIN mp_report p ON p.id=v.report_id JOIN mp_experience_run r ON r.id=p.experience_run_id AND r.student_id=p.student_id WHERE p.student_id=? AND p.public_id=? AND v.public_id=? AND v.version_no=? AND v.status IN ('READY','SUPERSEDED') AND p.report_type='EXPERIENCE' AND r.public_id=?",Integer.class,student,sourceReport.path("reportId").asText(),sourceReport.path("reportVersionId").asText(),sourceReport.path("versionNo").asLong(),source.path("experienceRunId").asText())!=1)throw new ApiException(409,"REPORT_SOURCE_INVALID");
        }
        for(var source:input.path("runs")){var rows=db.jdbc().queryForList("SELECT r.closed_input_sha256,t.manifest_sha256 FROM mp_experience_run r JOIN mp_task_version t ON t.id=r.task_version_id WHERE r.public_id=? AND r.student_id=? AND r.status='CLOSED' AND t.public_id=?",source.path("experienceRunId").asText(),student,source.path("taskVersionId").asText());if(rows.size()!=1||!source.path("closedInputSha256").asText().equals(s(rows.getFirst(),"closed_input_sha256"))||!source.path("taskManifestSha256").asText().equals(s(rows.getFirst(),"manifest_sha256")))throw new ApiException(409,"REPORT_SOURCE_INVALID");}
    }
    private void publish(Lease l,JsonNode input,JsonNode reviewed){
        boolean ready=Boolean.TRUE.equals(tx.execute(t->{if(!fence(l))return false;var v=version(l);verify(input,v,l.student);if(!s(v,"generation_phase").equals("REVIEW_REQUESTED")||v.get("review_invocation_id")==null)throw new ApiException(409,"METHOD_REVIEW_REQUIRED");var report=db.jdbc().queryForMap("SELECT * FROM mp_report WHERE id=? FOR UPDATE",n(v,"report_id"));
            var body=db.mapper().createObjectNode().put("schemaVersion",MethodReportContract.SCHEMA).put("reportId",s(report,"public_id")).put("reportVersionId",s(v,"public_id")).put("versionNo",n(v,"version_no")).put("reportType",input.path("reportType").asText()).put("generatedAt",Instant.now().toString()).put("generationMode","AI");
            if(input.path("runs").size()==1)body.put("majorCode",input.path("runs").get(0).path("majorCode").asText());else body.putNull("majorCode");
            body.set("methodAnalysis",MethodReportContract.publicAnalysis(db.mapper(),input,reviewed));body.set("nextRecommendation",input.path("nextRecommendation").deepCopy());
            body.set("calculationConditions",com.ruoyi.majorpilot.learning.MethodReportFacts.calculationConditions(db.mapper(),input));
            var sources=body.putArray("sources");for(var s:input.path("runs")){var p=sources.addObject();for(String k:List.of("majorCode","experienceRunId","taskVersionId","taskVersionCode","taskTitle","sourceReport"))p.set(k,s.path(k).deepCopy());}
            var professions=body.putArray("professionConnections");for(var s:input.path("runs"))professions.addObject().put("majorCode",s.path("majorCode").asText()).put("methodName",s.at("/method/methodName").asText()).put("scope",s.at("/method/scope").asText());
            body.putArray("sections");body.putArray("limitations").add("这份报告只解释本次合成案例的有限记录，不判断长期能力或专业适合度。").add("帮助已提供不代表已读或理解；本地回填数值一致也不能证明Excel操作过程。").add("AI初稿经过另一轮独立审阅，但仍可能理解错误，可以反馈具体段落。");
            if(input.path("runs").size()>1)((ArrayNode)body.path("limitations")).add("案例难度与已有经验不同，后续体验可能受到前次帮助，不能把结果当作同一起点下的专业排名。");
            if(!new com.ruoyi.majorpilot.report.core.ReportSchema(db.mapper()).output(body))throw new ApiException(409,"METHOD_REPORT_INVALID");
            db.jdbc().update("UPDATE mp_report_version SET status='READY',generation_phase='PUBLISHED',generation_mode='AI',structured_report_json=?,report_body_sha256=?,reviewed_proposal_sha256=?,validation_result_json=?,rendered_at=UTC_TIMESTAMP(3),completed_at=UTC_TIMESTAMP(3) WHERE id=?",db.json(body),db.hash(body),db.hash(reviewed),db.json(map("schema",MethodReportContract.SCHEMA,"sourceChecks",true,"independentReviewCompleted",true,"semanticCertainty",false)),l.version);
            if(report.get("current_version_id")!=null)db.jdbc().update("UPDATE mp_report_version SET status='SUPERSEDED' WHERE id=? AND status='READY'",n(report,"current_version_id"));
            db.jdbc().update("UPDATE mp_report SET current_version_id=?,generation_target_version_id=NULL,status='READY',ready_at=UTC_TIMESTAMP(3),first_ready_at=COALESCE(first_ready_at,UTC_TIMESTAMP(3)),row_version=row_version+1 WHERE id=?",l.version,n(report,"id"));
            if(allowances!=null)allowances.finish(l.student,s(v,"public_id"),true);
            db.jdbc().update("UPDATE mp_background_job SET status='SUCCEEDED',completed_at=UTC_TIMESTAMP(3),lease_until=NULL WHERE id=?",l.job);return true;}));
        // A third source may have become ready while this comparison was running.
        // Reconcile again after either kind publishes; identical sources are a no-op.
        if(ready)tx.executeWithoutResult(t->{var accounts=db.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",l.student);if(accounts.size()==1&&s(accounts.getFirst(),"status").equals("ACTIVE"))reports.comparison(l.student);});
    }
    private void fail(Lease l,String code){tx.executeWithoutResult(t->{if(!fence(l))return;var v=version(l);db.jdbc().update("UPDATE mp_ai_call SET status='UNKNOWN',error_code=? WHERE report_version_id=? AND status='IN_PROGRESS'",code,l.version);db.jdbc().update("UPDATE mp_report_version SET status='FAILED',failure_code=?,completed_at=UTC_TIMESTAMP(3) WHERE id=?",code,l.version);db.jdbc().update("UPDATE mp_report SET generation_target_version_id=NULL,status=IF(current_version_id IS NULL,'FAILED','READY'),row_version=row_version+1 WHERE id=? AND generation_target_version_id=?",n(v,"report_id"),l.version);db.jdbc().update("UPDATE mp_background_job SET status='FAILED',last_error_code=?,completed_at=UTC_TIMESTAMP(3),lease_until=NULL WHERE id=?",code,l.job);if(allowances!=null)allowances.finish(l.student,s(v,"public_id"),false);});}
}
