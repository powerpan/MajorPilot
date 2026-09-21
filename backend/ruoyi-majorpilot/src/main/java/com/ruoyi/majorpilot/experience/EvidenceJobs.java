package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.shared.*;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;

/** Durable, bounded evidence worker. Source reads happen outside the short lease/publication transactions. */
@Service @Profile("local")
public class EvidenceJobs {
    public record Lease(long job,long student,long run,long version,String worker,long snapshot,String closedSha,String mode,String rule) {}
    public record Item(String key,String type,String sourceType,long sourceId,JsonNode value,String summary,List<String> claims,Instant observedAt) {}
    private final RunService runs;private final RunStore db;private final ClosurePipeline closure;
    private final String worker="evidence-"+UUID.randomUUID();
    public EvidenceJobs(RunService runs,ClosurePipeline closure){this.runs=runs;this.db=runs.store();this.closure=closure;}
    @Scheduled(fixedDelay=2000) public void tick(){Lease lease=claim(worker);if(lease!=null)process(lease);}
    public Lease claim(String workerId){
        var candidates=db.jdbc().queryForList("SELECT id,owner_student_id FROM mp_background_job WHERE job_type='EVIDENCE_BUILD' AND ((status IN ('PENDING','RETRY_WAIT') AND available_at<=UTC_TIMESTAMP(3)) OR (status='RUNNING' AND lease_until<=UTC_TIMESTAMP(3))) ORDER BY available_at,id LIMIT 20");
        for(var candidate:candidates){Lease lease=runs.transactions().execute(status->{
            long student=n(candidate,"owner_student_id");var account=db.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student);if(account.isEmpty())return null;
            var jobs=db.jdbc().queryForList("SELECT * FROM mp_background_job WHERE id=? AND ((status IN ('PENDING','RETRY_WAIT') AND available_at<=UTC_TIMESTAMP(3)) OR (status='RUNNING' AND lease_until<=UTC_TIMESTAMP(3))) FOR UPDATE SKIP LOCKED",n(candidate,"id"));if(jobs.isEmpty())return null;var job=jobs.getFirst();long run=n(job,"target_id");
            db.jdbc().update("UPDATE mp_evidence_snapshot SET status='FAILED',failure_code='LEASE_EXPIRED' WHERE experience_run_id=? AND status='BUILDING'",run);
            String ownerStatus=s(account.getFirst(),"status");
            if(Set.of("DELETION_PENDING","DELETED").contains(ownerStatus)){db.jdbc().update("UPDATE mp_background_job SET status='CANCELLED',last_error_code='OWNER_UNAVAILABLE',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",n(job,"id"));return null;}
            if(!ownerStatus.equals("ACTIVE")){db.jdbc().update("UPDATE mp_background_job SET status='RETRY_WAIT',last_error_code='OWNER_LOCKED',lease_until=NULL,available_at=UTC_TIMESTAMP(3)+INTERVAL 30 SECOND WHERE id=?",n(job,"id"));return null;}
            if(n(job,"attempt_count")>=3){db.jdbc().update("UPDATE mp_background_job SET status='FAILED',last_error_code='LEASE_EXPIRED',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",n(job,"id"));db.jdbc().update("UPDATE mp_report SET status='FAILED',row_version=row_version+1 WHERE experience_run_id=? AND status='PENDING'",run);return null;}
            var source=db.jdbc().queryForMap("SELECT status,student_id,run_mode,decision_profile_id,task_version_id,closed_input_sha256,closed_input_manifest_json FROM mp_experience_run WHERE id=?",run);
            if(!s(source,"status").equals("CLOSED")||n(source,"student_id")!=student)throw new IllegalStateException("Invalid evidence job ownership");
            String rule=ClosurePipeline.frozenRule(db.node(source.get("closed_input_manifest_json")));
            long version=n(job,"lease_version")+1;long snapshotVersion=db.jdbc().queryForObject("SELECT COALESCE(MAX(snapshot_version_no),0)+1 FROM mp_evidence_snapshot WHERE experience_run_id=?",Long.class,run);String publicId=PublicIds.next();
            db.jdbc().update("INSERT INTO mp_evidence_snapshot(public_id,student_id,experience_run_id,snapshot_version_no,run_mode,decision_profile_id,task_version_id,closed_input_sha256,evidence_rule_version,status) VALUES(?,?,?,?,?,?,?,?,?,'BUILDING')",publicId,student,run,snapshotVersion,s(source,"run_mode"),n(source,"decision_profile_id"),n(source,"task_version_id"),s(source,"closed_input_sha256"),rule);
            long snapshot=db.jdbc().queryForObject("SELECT id FROM mp_evidence_snapshot WHERE public_id=?",Long.class,publicId);
            db.jdbc().update("UPDATE mp_background_job SET status='RUNNING',attempt_count=attempt_count+1,lease_version=?,worker_id=?,lease_until=UTC_TIMESTAMP(3)+INTERVAL 60 SECOND,started_at=COALESCE(started_at,UTC_TIMESTAMP(3)),target_version=?,checkpoint_json=? WHERE id=?",version,workerId,snapshotVersion,db.json(map("snapshotId",snapshot,"closedInputSha256",s(source,"closed_input_sha256"),"evidenceRuleVersion",rule)),n(job,"id"));
            return new Lease(n(job,"id"),student,run,version,workerId,snapshot,s(source,"closed_input_sha256"),s(source,"run_mode"),rule);
        });if(lease!=null)return lease;}return null;
    }
    public boolean heartbeat(Lease lease){return db.jdbc().update("UPDATE mp_background_job SET lease_until=UTC_TIMESTAMP(3)+INTERVAL 60 SECOND WHERE id=? AND lease_version=? AND worker_id=? AND status='RUNNING' AND lease_until>UTC_TIMESTAMP(3)",lease.job,lease.version,lease.worker)==1;}
    public void process(Lease lease){try{publish(lease,build(lease));}catch(RuntimeException failure){fail(lease,failure instanceof ApiException rejected?rejected.code:"EVIDENCE_BUILD_FAILED");}}
    public List<Item> build(Lease lease){
        var row=db.jdbc().queryForMap("SELECT closed_input_manifest_json,closed_input_sha256 FROM mp_experience_run WHERE id=? AND student_id=? AND status='CLOSED'",lease.run,lease.student);JsonNode manifest=db.node(row.get("closed_input_manifest_json"));
        require(lease.closedSha.equals(s(row,"closed_input_sha256"))&&lease.closedSha.equals(closure.hash(manifest))&&manifest.path("runMode").asText().equals(lease.mode)&&lease.rule.equals(ClosurePipeline.frozenRule(manifest)));
        // Only this explicit schema/rule pair has safe claim semantics. Legacy READY snapshots are not touched.
        if(!manifest.path("schemaVersion").asText().equals("closed-input-v3")||!Set.of("evidence-v2","ds-evidence-v1","ba-evidence-v1").contains(lease.rule))throw new ApiException(409,"EVIDENCE_RULE_UNSUPPORTED");
        require(db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE id=? AND owner_student_id=? AND target_id=? AND business_key=?",Integer.class,lease.job,lease.student,lease.run,ClosurePipeline.evidenceKey(manifest.path("runId").asText(),lease.closedSha,lease.rule))==1);
        Row run=db.internal(lease.run);require(runs.version(run).manifestSha256().equals(manifest.path("taskManifestSha256").asText()));
        if(!(run.majorCode().equals("AI")&&lease.rule.equals("evidence-v2")||run.majorCode().equals("DATA_SCIENCE")&&lease.rule.equals("ds-evidence-v1")||run.majorCode().equals("BUSINESS_ANALYTICS")&&lease.rule.equals("ba-evidence-v1")))throw new ApiException(409,"EVIDENCE_RULE_UNSUPPORTED");
        require(Objects.equals(run.profileId(),manifest.path("decisionProfileId").asLong())&&closure.profileHash(run.profileId(),lease.student).equals(manifest.path("profileSha256").asText()));
        var result=new ArrayList<Item>();var frozenResponses=new HashMap<String,JsonNode>();var frozenRevisions=new HashMap<String,Long>();
        for(var step:manifest.path("steps")){
            var response=db.jdbc().queryForMap("SELECT r.response_json,r.content_sha256,r.revision_no,r.received_at,s.step_key FROM mp_step_response_revision r JOIN mp_step_state s ON s.id=r.step_state_id WHERE r.id=? AND s.experience_run_id=?",step.path("revisionId").asLong(),lease.run);JsonNode value=db.node(response.get("response_json"));
            require(s(response,"content_sha256").equals(step.path("sha256").asText())&&closure.hash(value).equals(step.path("valueSha256").asText())&&n(response,"revision_no")==step.path("revision").asLong()&&s(response,"step_key").equals(step.path("stepKey").asText()));
            require(frozenResponses.put(step.path("stepKey").asText(),value)==null);frozenRevisions.put(step.path("stepKey").asText(),step.path("revision").asLong());
            result.addAll(stepItems(run.majorCode(),step.path("stepKey").asText(),step.path("revisionId").asLong(),value,time(response,"received_at")));
        }
        var requiredOperations=new HashMap<String,JsonNode>();
        for(var definition:runs.version(run).manifest().path("steps")){
            String stepKey=definition.path("stepKey").asText();if(definition.path("required").asBoolean(true))require(frozenResponses.containsKey(stepKey));
            String operationKey=definition.path("operationKey").asText("");if(!operationKey.isBlank()&&frozenResponses.containsKey(stepKey))requiredOperations.put(operationKey,runs.operation(run,operationKey));
        }
        var seenOperations=new HashSet<String>();
        for(var execution:manifest.path("executions")){
            String operationKey=execution.path("operationKey").asText(),stepKey=execution.path("stepKey").asText();var operation=requiredOperations.get(operationKey);
            require(operation!=null&&seenOperations.add(operationKey)&&operation.path("stepKey").asText().equals(stepKey)&&Objects.equals(frozenRevisions.get(stepKey),execution.path("appliedRevision").asLong()));
            var expectedSources=new TreeMap<String,Long>();
            for(var binding:operation.path("inputBindings")){
                String ancestor=binding.path("sourceStepKey").asText(),field=binding.path("sourceField").asText();var input=frozenResponses.get(ancestor);require(input!=null);
                if(!input.has(field)){require(ExecutionBindings.optional(runs.stepDefinition(run,ancestor).path("inputSchema"),field)&&ExecutionBindings.optional(operation.path("parametersSchema"),binding.path("parameterKey").asText()));continue;}
                expectedSources.put(ancestor,frozenRevisions.get(ancestor));
            }
            require(execution.path("sourceRevisions").isObject()&&expectedSources.equals(runs.sourceMap(execution.path("sourceRevisions"))));
            var source=db.jdbc().queryForMap("SELECT public_id,operation_key,step_key,result_json,status,trust_level,created_at FROM mp_execution_record WHERE id=? AND experience_run_id=?",execution.path("executionId").asLong(),lease.run);JsonNode value=db.node(source.get("result_json"));
            require(s(source,"public_id").equals(execution.path("publicId").asText())&&s(source,"operation_key").equals(operationKey)&&s(source,"step_key").equals(stepKey));
            require(s(source,"status").equals("SUCCEEDED")&&s(source,"trust_level").equals("SERVER_VERIFIED")&&closure.hash(value).equals(execution.path("resultSha256").asText()));
            require(db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_response_execution x JOIN mp_step_response_revision r ON r.id=x.response_revision_id JOIN mp_step_state s ON s.id=r.step_state_id WHERE x.execution_record_id=? AND s.experience_run_id=? AND s.step_key=? AND r.revision_no=? AND x.source_binding_sha256=?",Integer.class,execution.path("executionId").asLong(),lease.run,execution.path("stepKey").asText(),execution.path("appliedRevision").asLong(),runs.bindingHash(runs.sourceMap(execution.path("sourceRevisions"))))>0);
            result.add(new Item("execution:"+execution.path("publicId").asText(),"VERIFIED_EXECUTION","EXECUTION_RECORD",execution.path("executionId").asLong(),selectedExecution(run.majorCode(),value),run.majorCode().equals("AI")?"固定版本引擎验证的聚合结果；不推断专业适合度":"固定版本引擎验证的聚合结果；不推断因果、专业适合度或稳定能力",List.of("OBSERVED_FACT"),time(source,"created_at")));
        }
        require(seenOperations.equals(requiredOperations.keySet()));
        var reflection=db.jdbc().queryForMap("SELECT draft_json,status,row_version,submitted_at FROM mp_reflection WHERE id=? AND experience_run_id=?",manifest.path("reflectionId").asLong(),lease.run);JsonNode answers=db.node(reflection.get("draft_json"));require(s(reflection,"status").equals("SUBMITTED")&&n(reflection,"row_version")==manifest.path("reflectionRevision").asLong()&&closure.hash(answers).equals(manifest.path("reflectionSha256").asText()));
        for(String field:List.of("interestingStepKeys","difficultySources","continueSimilarWork","nextWorkStyle"))if(answers.has(field))result.add(new Item("reflection:"+field,"SELF_REPORT","REFLECTION",manifest.path("reflectionId").asLong(),answers.get(field),"学生在本次体验中的自述；不作为客观能力评分",List.of("STUDENT_SELF_REPORT"),time(reflection,"submitted_at")));
        for(var hint:manifest.path("hints")){
            var source=db.jdbc().queryForMap("SELECT response_json,hint_level,status,requested_at FROM mp_hint_request WHERE id=? AND experience_run_id=?",hint.path("hintId").asLong(),lease.run);require(Set.of("SUCCEEDED","FALLBACK").contains(s(source,"status"))&&closure.hash(db.node(source.get("response_json"))).equals(hint.path("responseSha256").asText()));
            result.add(new Item("hint:"+hint.path("hintId").asLong(),"ASSISTANCE_CONTEXT","HINT_REQUEST",hint.path("hintId").asLong(),db.mapper().valueToTree(map("stepKey",hint.path("stepKey").asText(),"hintLevel",hint.path("hintLevel").asInt())),"本次请求的提示层级；不等同于能力高低",List.of("OBSERVED_FACT","LIMITATION"),time(source,"requested_at")));
        }
        require(!result.isEmpty());return List.copyOf(result);
    }
    public boolean publish(Lease lease,List<Item> items){return Boolean.TRUE.equals(runs.transactions().execute(status->{if(!fence(lease))return false;
        var snapshot=db.jdbc().queryForMap("SELECT status,evidence_rule_version,closed_input_sha256 FROM mp_evidence_snapshot WHERE id=? AND experience_run_id=?",lease.snapshot,lease.run);if(!s(snapshot,"status").equals("BUILDING")||!s(snapshot,"evidence_rule_version").equals(lease.rule)||!s(snapshot,"closed_input_sha256").equals(lease.closedSha))return false;
        for(var item:items)db.jdbc().update("INSERT INTO mp_evidence_item(public_id,evidence_snapshot_id,evidence_key,evidence_type,source_type,source_id,structured_value_json,display_summary,allowed_claim_types_json,sensitivity_class,observed_at,rule_version) VALUES(?,?,?,?,?,?,?,?,?,'INTERNAL',?,?)",PublicIds.next(),lease.snapshot,item.key,item.type,item.sourceType,item.sourceId,db.json(item.value),item.summary,db.json(item.claims),Timestamp.from(item.observedAt),lease.rule);
        String sha=closure.hash(db.mapper().valueToTree(items));db.jdbc().update("UPDATE mp_evidence_snapshot SET status='READY',snapshot_sha256=?,built_at=UTC_TIMESTAMP(3) WHERE id=?",sha,lease.snapshot);
        db.jdbc().update("UPDATE mp_background_job SET status='SUCCEEDED',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=?",lease.job);
        db.jdbc().update("UPDATE mp_run_closure_request SET status='READY' WHERE experience_run_id=?",lease.run);return true;
    }));}
    public boolean fail(Lease lease,String code){return Boolean.TRUE.equals(runs.transactions().execute(status->{if(!fence(lease))return false;db.jdbc().update("UPDATE mp_evidence_snapshot SET status='FAILED',failure_code=? WHERE id=? AND status='BUILDING'",code,lease.snapshot);boolean permanent=code.equals("EVIDENCE_RULE_UNSUPPORTED");db.jdbc().update("UPDATE mp_background_job SET status=IF(attempt_count>=3 OR ?,'FAILED','RETRY_WAIT'),available_at=UTC_TIMESTAMP(3)+INTERVAL IF(attempt_count=1,5,30) SECOND,lease_until=NULL,last_error_code=?,completed_at=IF(attempt_count>=3 OR ?,UTC_TIMESTAMP(3),NULL) WHERE id=?",permanent,code,permanent,lease.job);db.jdbc().update("UPDATE mp_report SET status='FAILED',row_version=row_version+1 WHERE experience_run_id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM mp_background_job WHERE id=? AND status='FAILED')",lease.run,lease.job);db.jdbc().update("UPDATE mp_run_closure_request SET status='FAILED' WHERE experience_run_id=? AND status='PENDING' AND EXISTS(SELECT 1 FROM mp_background_job WHERE id=? AND status='FAILED')",lease.run,lease.job);return true;}));}
    private boolean fence(Lease lease){
        var account=db.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",lease.student);if(account.isEmpty()||!s(account.getFirst(),"status").equals("ACTIVE"))return false;
        var job=db.jdbc().queryForList("SELECT id FROM mp_background_job WHERE id=? AND owner_student_id=? AND target_id=? AND lease_version=? AND worker_id=? AND status='RUNNING' AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE",lease.job,lease.student,lease.run,lease.version,lease.worker);if(job.isEmpty())return false;
        return db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_experience_run WHERE id=? AND student_id=? AND status='CLOSED' AND closed_input_sha256=? AND run_mode=?",Integer.class,lease.run,lease.student,lease.closedSha,lease.mode)==1;
    }
    private static void require(boolean valid){if(!valid)throw new ApiException(409,"EVIDENCE_SOURCE_INVALID");}
    List<Item> stepItems(String major,String step,long revisionId,JsonNode input,Instant observedAt){
        if(!Set.of("AI","DATA_SCIENCE","BUSINESS_ANALYTICS").contains(major))throw new ApiException(409,"EVIDENCE_RULE_UNAVAILABLE");
        List<String> actionFields=major.equals("BUSINESS_ANALYTICS")?switch(step){case "b1-context"->List.of("acknowledged","outOfScope");case "b2-metric"->List.of("numerator","denominator","baselineStartWeek","baselineEndWeek","comparisonStartWeek","comparisonEndWeek");case "b3-funnel"->List.of("focusTransitionKey");case "b4-segment"->List.of("segmentBy","prioritySegmentKey");default->List.of();}:major.equals("AI")?switch(step){case "a3-errors"->List.of("inspectedSampleIds");case "a4-configure"->List.of("definitionVariantIds","exampleIds","confidenceThreshold","lowConfidencePolicy");case "a6-decision"->List.of("rolloutDecision");default->List.of();}:switch(step){case "d1-context"->List.of("acknowledged","observationUnit","targetField");case "d2-quality"->List.of("duplicatePolicy","missingPolicy","extremePolicy");case "d3-profile"->List.of("distributionField");case "d4-relationship"->List.of("relationshipMode","groupBy","xField","yField");case "d5-stratify"->List.of("stratifyBy");default->List.of();};
        List<String> analysisFields=major.equals("BUSINESS_ANALYTICS")?switch(step){case "b1-context"->List.of("businessQuestion","decisionScope");case "b2-metric"->List.of("metricReason");case "b3-funnel"->List.of("focusReason");case "b4-segment"->List.of("priorityReason");case "b5-hypothesis"->List.of("observation","evidenceStepKey","hypothesis","unknownInformation");case "b6-action"->List.of("actionKey","actionDescription","actionReason","targetSegmentKey","successMetric","targetChangePercentagePoints","guardrailMetric","guardrailMaximum","reviewAfterDays","testPlan");default->List.of();}:major.equals("AI")?switch(step){case "a3-errors"->List.of("errorPatterns");case "a4-configure"->List.of("modificationReason","expectedEffect");case "a5-evaluate"->List.of("comparisonNotes","tradeoff");case "a6-decision"->List.of("decisionReason","monitoringItems","residualRisk");default->List.of();}:switch(step){case "d2-quality"->List.of("identifiedIssues","duplicateReason","missingReason");case "d3-profile"->List.of("sampleInterpretation");case "d4-relationship"->List.of("observation");case "d5-stratify"->List.of("uncertaintyComment","causalJudgment");case "d6-conclusion"->List.of("findings","unsupportedCausalClaim","limitations","nextQuestion");default->List.of();};
        var action=db.mapper().createObjectNode();for(String field:actionFields)if(input.has(field))action.set(field,input.get(field));
        var analysis=db.mapper().createObjectNode();for(String field:analysisFields)if(input.has(field))analysis.set(field,input.get(field));
        if(!analysis.isEmpty())action.put("submittedAnalysisFieldCount",analysis.size());
        var items=new ArrayList<Item>();
        if(!action.isEmpty())items.add(new Item("step:"+step,"STEP_RESPONSE","STEP_RESPONSE_REVISION",revisionId,action,"系统仅记录学生所选配置、选项及提交行为；不验证选择、解释或命题正确",List.of("OBSERVED_FACT"),observedAt));
        if(!analysis.isEmpty())items.add(new Item("analysis:"+step,"STUDENT_ANALYSIS","STEP_RESPONSE_REVISION",revisionId,db.mapper().valueToTree(map("verificationStatus","UNVERIFIED","attribution","STUDENT_AUTHORED_ANALYSIS","answers",analysis)),"学生撰写的分析、预测或方案，未经内容验证；不是 Reflection 体验自述，不能据此发布事实主张",List.of(),observedAt));
        return List.copyOf(items);
    }
    JsonNode selectedExecution(String major,JsonNode value){
        if(major.equals("AI"))return value;
        if(major.equals("BUSINESS_ANALYTICS")){
            if(!value.path("schemaVersion").asText().equals("ba-result-v1")||!Set.of("ba-metric","ba-funnel","ba-segments").contains(value.path("operationKey").asText()))throw new ApiException(409,"EVIDENCE_RULE_UNAVAILABLE");
            var result=db.mapper().createObjectNode();for(String field:List.of("schemaVersion","operationKey","datasetSha256","windows","observation","numerator","denominator","baseline","comparison","deltaPercentagePoints","relativeChange","trend","stages","transitions","segmentBy","focusTransitionKey","segments"))if(value.has(field))result.set(field,value.get(field).deepCopy());return result;
        }
        if(!major.equals("DATA_SCIENCE")||!value.path("schemaVersion").asText().equals("ds-result-v1"))throw new ApiException(409,"EVIDENCE_RULE_UNAVAILABLE");
        var result=db.mapper().createObjectNode();
        for(String field:List.of("schemaVersion","operationKey","datasetSha256","cleaningConfigSha256","inputRows","retainedRows","uniqueLearners","analysisRows","exclusions","quality","profile","relationship","stratified"))if(value.has(field))result.set(field,value.get(field).deepCopy());
        // Evidence needs aggregate verification, not individual chart points or duplicate learner identifiers.
        if(result.path("quality").isObject())((com.fasterxml.jackson.databind.node.ObjectNode)result.path("quality")).remove("duplicateGroups");
        if(result.path("relationship").isObject())((com.fasterxml.jackson.databind.node.ObjectNode)result.path("relationship")).remove("points");
        if(result.path("stratified").path("overall").isObject())((com.fasterxml.jackson.databind.node.ObjectNode)result.path("stratified").path("overall")).remove("points");
        for(var stratum:result.path("stratified").path("strata"))if(stratum.path("summary").isObject())((com.fasterxml.jackson.databind.node.ObjectNode)stratum.path("summary")).remove("points");
        return result;
    }
}
