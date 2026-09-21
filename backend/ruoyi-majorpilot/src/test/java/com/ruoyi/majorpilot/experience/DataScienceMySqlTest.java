package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.classifier.ClassifierEngine;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.datascience.DsStatsEngine;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static com.ruoyi.majorpilot.experience.ExperienceMySqlTest.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class DataScienceMySqlTest {
    static final String VERSION="01JD1000000000000000000001";
    static final List<String> installed=new ArrayList<>();
    ExperienceMySqlTest base;RunStore store;RunService runs;PublishedTaskContentProvider provider;TaskContent.Version version;ExecutionService execute;FixedExecutionCalculator calculator;ReflectionService reflection;ClosurePipeline closure;EvidenceJobs jobs;StudentPrincipal student;
    @BeforeAll static void database(){ExperienceMySqlTest.database();for(String id:List.of(VERSION,ProfessionalMySqlTest.VERSION,BusinessAnalyticsMySqlTest.VERSION))if(db.queryForObject("SELECT COUNT(*) FROM mp_task_version WHERE public_id=?",Integer.class,id)==0)installed.add(id);new TaskPublicationService(db,tx,repository,mapper,true,true).installEngineeringPreviews();}
    @AfterAll static void cleanupContent(){for(String id:installed)db.update("DELETE FROM mp_task_version WHERE public_id=? AND status='REVIEW'",id);installed.clear();}
    @BeforeEach void setup(){base=new ExperienceMySqlTest();base.fixture();student=base.student;store=new RunStore(db,mapper,true,true);provider=new PublishedTaskContentProvider(db,repository,true,true);runs=new RunService(store,provider,base.idem,tx);version=provider.review(VERSION);calculator=new FixedExecutionCalculator(provider,mapper,new ClassifierEngine(repository,mapper),new DsStatsEngine(repository,mapper));execute=new ExecutionService(runs,calculator,mock(RateLimits.class));closure=new ClosurePipeline(runs);reflection=new ReflectionService(runs,closure);jobs=new EvidenceJobs(runs,closure);}
    @AfterEach void cleanup(){var cleaner=new ProfessionalMySqlTest();cleaner.student=student;cleaner.base=base;cleaner.cleanup();}
    JsonNode definition(String step){for(var definition:version.manifest().path("steps"))if(definition.path("stepKey").asText().equals(step))return definition;throw new IllegalArgumentException(step);}
    JsonNode answer(JsonNode schema,int index){if(schema.has("const"))return schema.get("const");if(schema.has("enum"))return schema.path("enum").get(index%schema.path("enum").size());return switch(schema.path("type").asText()){
        case "object"->{var node=mapper.createObjectNode();for(var field:schema.path("required"))node.set(field.asText(),answer(schema.path("properties").path(field.asText()),0));yield node;}
        case "array"->{var node=mapper.createArrayNode();for(int i=0;i<schema.path("minItems").asInt();i++)node.add(answer(schema.path("items"),i));yield node;}
        case "boolean"->BooleanNode.TRUE;case "number","integer"->IntNode.valueOf(schema.path("minimum").asInt());default->TextNode.valueOf("这是本次合成数据测试的有限分析和解释，不代表因果结论"+index);
    };}
    ObjectNode input(String step){return (ObjectNode)answer(definition(step).path("inputSchema"),0);}
    RunDtos.Run start(){var run=runs.createPreview(student,key(),new RunDtos.CreatePreview(VERSION));return runs.transition(student,run.runId(),"start",key(),new RunDtos.Transition(run.revision(),null,null));}
    RunDtos.Run current(RunDtos.Run run){return runs.get(student,run.runId());}
    RunDtos.Saved save(RunDtos.Run run,String step,JsonNode input){var view=runs.step(student,run.runId(),step);return runs.save(student,run.runId(),step,new RunDtos.Save(view.revision(),view.responseSchemaVersion(),input));}
    RunDtos.Run complete(RunDtos.Run run,String step){var view=runs.step(student,run.runId(),step);return runs.completeStep(student,run.runId(),step,key(),new RunDtos.Revision(view.revision()));}
    RunDtos.Execute request(RunDtos.Run run,String step){var view=runs.step(student,run.runId(),step);return new RunDtos.Execute(definition(step).path("operationKey").asText(),view.revision(),mapper.createObjectNode(),null,null,runs.sources(view.inputBindings()));}
    RunDtos.Execution calculate(RunDtos.Run run,String step){return execute.execute(student,run.runId(),key(),request(run,step));}
    RunDtos.Run toQuality(){var run=start();save(run,"d1-context",input("d1-context"));return complete(run,"d1-context");}
    void quality(RunDtos.Run run,ObjectNode configuration){save(run,"d2-quality",configuration);calculate(run,"d2-quality");complete(run,"d2-quality");}
    void profile(RunDtos.Run run){save(run,"d3-profile",input("d3-profile"));calculate(run,"d3-profile");complete(run,"d3-profile");}
    RunDtos.Run toRelationship(){var run=toQuality();quality(run,input("d2-quality"));profile(run);return current(run);}
    ObjectNode group(String field){return input("d4-relationship").put("relationshipMode","GROUP_COMPLETION").put("groupBy",field);}
    ObjectNode scatter(){return input("d4-relationship").put("relationshipMode","SCATTER").put("xField","avg_session_minutes").put("yField","days_to_first_lesson");}
    long successes(RunDtos.Run run,String operation){return db.queryForObject("SELECT COUNT(*) FROM mp_execution_record e JOIN mp_experience_run r ON r.id=e.experience_run_id WHERE r.public_id=? AND e.operation_key=? AND e.status='SUCCEEDED'",Long.class,run.runId(),operation);}
    @Test void ownRevisionZeroRemainsReadableAndV3RequiresEmptyParametersAndExplicitSources(){
        var run=toQuality();assertEquals(0,runs.step(student,run.runId(),"d2-quality").revision());assertTrue(runs.step(student,run.runId(),"d2-quality").inputBindings().isEmpty());
        save(run,"d2-quality",input("d2-quality"));var input=request(run,"d2-quality");
        base.error("VALIDATION_ERROR",()->execute.execute(student,run.runId(),key(),new RunDtos.Execute(input.operationKey(),input.inputRevision(),mapper.createObjectNode(),null,null)));
        base.error("EXECUTION_NOT_ALLOWED",()->execute.execute(student,run.runId(),key(),new RunDtos.Execute(input.operationKey(),input.inputRevision(),mapper.createObjectNode().put("duplicatePolicy","KEEP"),null,null,Map.of())));
        var first=calculate(run,"d2-quality");assertEquals(29,first.remainingEvaluations());assertEquals(Map.of(),first.sourceRevisions());
        var explanation=input("d2-quality");explanation.put("duplicateReason","仅更改理由文字，操作配置应复用原来验证结果");save(run,"d2-quality",explanation);var reused=calculate(run,"d2-quality");assertTrue(reused.reused());assertEquals(first.executionId(),reused.executionId());assertEquals(29,reused.remainingEvaluations());assertEquals(2L,reused.appliedToRevision());
    }
    @Test void ancestorAndOwnFieldsComposeWithoutReadingMissingInactiveOptionalFields(){
        var run=toRelationship();save(run,"d4-relationship",scatter());var result=calculate(run,"d4-relationship");assertEquals(Map.of("d2-quality",1L),result.sourceRevisions());assertEquals("SCATTER",result.result().path("relationship").path("relationshipMode").asText());complete(run,"d4-relationship");
        var initial=runs.step(student,run.runId(),"d5-stratify");assertEquals(0,initial.revision());assertEquals(Map.of("d2-quality",1L,"d4-relationship",1L),runs.sources(initial.inputBindings()));assertTrue(initial.inputBindings().stream().noneMatch(b->b.parameterKey().equals("groupBy")));
        save(run,"d5-stratify",input("d5-stratify"));var stratified=calculate(run,"d5-stratify");assertEquals(Map.of("d2-quality",1L,"d4-relationship",1L),stratified.sourceRevisions());assertEquals("SCATTER",stratified.result().path("stratified").path("overall").path("relationshipMode").asText());assertDoesNotThrow(()->complete(run,"d5-stratify"));
    }
    @Test void inactiveFieldsSameAxesAndSameStratumAreRejectedAtExecutionAndCompletion(){
        var run=toRelationship();
        for(ObjectNode invalid:List.of(scatter().put("groupBy","device_group"),scatter().put("yField","avg_session_minutes"),input("d4-relationship").put("relationshipMode","SCATTER"))){save(run,"d4-relationship",invalid);base.error("DS_PARAMETERS_INVALID",()->calculate(run,"d4-relationship"));base.error("DS_PARAMETERS_INVALID",()->complete(run,"d4-relationship"));}
        save(run,"d4-relationship",group("course_track"));calculate(run,"d4-relationship");complete(run,"d4-relationship");save(run,"d5-stratify",input("d5-stratify").put("stratifyBy","course_track"));
        base.error("DS_PARAMETERS_INVALID",()->calculate(run,"d5-stratify"));base.error("DS_PARAMETERS_INVALID",()->complete(run,"d5-stratify"));
    }
    @Test void sourceCasRejectsRequestsThatArriveAfterAncestorChangedAndHistoryCannotComplete(){
        var run=toRelationship();save(run,"d4-relationship",group("device_group"));var input=request(run,"d4-relationship");calculate(run,"d4-relationship");
        quality(run,input("d2-quality").put("missingPolicy","DROP_MISSING"));profile(run);
        base.error("EXECUTION_REVISION_STALE",()->execute.execute(student,run.runId(),key(),input));var history=runs.step(student,run.runId(),"d4-relationship").executions();assertNull(history.getFirst().appliedToRevision());assertNull(history.getFirst().appliedSourceRevisions());
        base.error("EXECUTION_NOT_ALLOWED",()->complete(run,"d4-relationship"));assertEquals(Map.of("d2-quality",2L),calculate(run,"d4-relationship").appliedSourceRevisions());assertDoesNotThrow(()->complete(run,"d4-relationship"));
    }
    @Test void terminalCasRejectsAncestorChangeOutsideCalculationTransaction()throws Exception{
        var run=toRelationship();save(run,"d4-relationship",group("device_group"));var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        var delayed=new ExecutionCalculator(){public JsonNode normalize(TaskContent.Version v,JsonNode o,JsonNode p){return calculator.normalize(v,o,p);}public JsonNode calculate(TaskContent.Version v,JsonNode o,JsonNode p){assertFalse(TransactionSynchronizationManager.isActualTransactionActive());entered.countDown();try{assertTrue(release.await(10,TimeUnit.SECONDS));}catch(InterruptedException e){throw new IllegalStateException(e);}return calculator.calculate(v,o,p);}};
        var service=new ExecutionService(runs,delayed,mock(RateLimits.class));var request=request(run,"d4-relationship");
        try(var pool=Executors.newSingleThreadExecutor()){var future=pool.submit(()->assertThrows(ApiException.class,()->service.execute(student,run.runId(),key(),request)).code);assertTrue(entered.await(5,TimeUnit.SECONDS));quality(run,input("d2-quality").put("missingPolicy","DROP_MISSING"));profile(run);release.countDown();assertEquals("EXECUTION_REVISION_STALE",future.get(10,TimeUnit.SECONDS));}finally{release.countDown();}
        assertEquals(0,successes(run,"ds-relationship"));base.error("EXECUTION_NOT_ALLOWED",()->complete(run,"d4-relationship"));
    }
    @Test void forgedClientResultFailsWithoutChargingSuccessfulConfigurationQuota(){
        var run=toQuality();save(run,"d2-quality",input("d2-quality"));var input=request(run,"d2-quality");var plan=execute.prepare(student,run.runId(),input);var forged=(ObjectNode)calculator.calculate(plan.version(),plan.operation(),plan.parameters());forged.put("retainedRows",forged.path("retainedRows").asInt()-1);
        base.error("EXECUTION_RESULT_MISMATCH",()->execute.execute(student,run.runId(),key(),new RunDtos.Execute(input.operationKey(),input.inputRevision(),mapper.createObjectNode(),null,forged,Map.of())));
        assertEquals(0,successes(run,"ds-quality-clean"));assertEquals(29,calculate(run,"d2-quality").remainingEvaluations());
    }
    @Test void perOperationQuotaCountsThirtyUniqueSuccessfulConfigurationsAndAllowsFreeReuse(){
        var run=toQuality();var configurations=new ArrayList<ObjectNode>();for(String duplicate:List.of("KEEP","DROP_EXACT"))for(String missing:List.of("KEEP_NULL","DROP_MISSING","MEDIAN_NUMERIC"))for(String extreme:List.of("KEEP","CAP_P95"))configurations.add(input("d2-quality").put("duplicatePolicy",duplicate).put("missingPolicy",missing).put("extremePolicy",extreme));
        var groups=List.of("course_track","signup_source","device_group","cohort_period","days_to_first_lesson_band");int evaluated=0;
        outer:for(var configuration:configurations){quality(run,configuration);profile(run);for(String group:groups){save(run,"d4-relationship",group(group));if(evaluated==30){base.error("EVALUATION_LIMIT_REACHED",()->calculate(run,"d4-relationship"));break outer;}assertEquals(29-evaluated,calculate(run,"d4-relationship").remainingEvaluations());evaluated++;}}
        assertEquals(30,successes(run,"ds-relationship"));quality(run,configurations.getFirst());profile(run);save(run,"d4-relationship",group(groups.getFirst()));var reused=calculate(run,"d4-relationship");assertTrue(reused.reused());assertEquals(0,reused.remainingEvaluations());assertEquals(30,successes(run,"ds-relationship"));assertTrue(successes(run,"ds-quality-clean")<30);
    }
    @Test void closeFreezesDsRuleVerifiedAggregatesAndUnverifiedStudentCausalClaims(){
        var run=toRelationship();save(run,"d4-relationship",scatter());calculate(run,"d4-relationship");complete(run,"d4-relationship");save(run,"d5-stratify",input("d5-stratify").put("causalJudgment","CLAIMS_CAUSAL_SUPPORT"));calculate(run,"d5-stratify");complete(run,"d5-stratify");
        var conclusion=input("d6-conclusion");String invented="这些观察证明移动设备必然导致失败，调整设备可以保证完成";((ObjectNode)conclusion.path("findings").get(0)).put("statement",invented);save(run,"d6-conclusion",conclusion);complete(run,"d6-conclusion");run=current(run);run=runs.taskComplete(student,run.runId(),key(),new RunDtos.Revision(run.revision()));
        var reflected=reflection.get(student,run.runId());var closed=reflection.submit(student,run.runId(),key(),new RunDtos.ReflectionSave(reflected.revision(),reflected.questionSetVersion(),answer(reflected.definition().path("inputSchema"),0)));assertEquals("NOT_APPLICABLE",closed.reportStatus());
        var lease=jobs.claim("test-ds-evidence");assertEquals("ds-evidence-v1",lease.rule());var items=jobs.build(lease);assertTrue(jobs.publish(lease,items));assertEquals("READY",db.queryForObject("SELECT status FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot()));
        assertEquals(4,items.stream().filter(i->i.type().equals("VERIFIED_EXECUTION")).count());
        for(var item:items){if(item.type().equals("VERIFIED_EXECUTION")){assertFalse(item.value().toString().contains("\"points\""));assertFalse(item.value().toString().contains("duplicateGroups"));assertEquals(List.of("OBSERVED_FACT"),item.claims());}if(item.value().toString().contains(invented)||item.value().toString().contains("CLAIMS_CAUSAL_SUPPORT")){assertEquals("STUDENT_ANALYSIS",item.type());assertTrue(item.claims().isEmpty());assertEquals("UNVERIFIED",item.value().path("verificationStatus").asText());}}
        assertTrue(items.stream().anyMatch(i->i.value().toString().contains(invented)));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_report WHERE student_id=?",Integer.class,student.internalId()));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_recommendation WHERE student_id=?",Integer.class,student.internalId()));
        assertEquals(Set.of("ds-evidence-v1"),new HashSet<>(db.queryForList("SELECT rule_version FROM mp_evidence_item WHERE evidence_snapshot_id=?",String.class,lease.snapshot())));
    }
    RunDtos.Run finishTask(RunDtos.Run run){
        profile(run);save(run,"d4-relationship",scatter());calculate(run,"d4-relationship");complete(run,"d4-relationship");
        save(run,"d5-stratify",input("d5-stratify"));calculate(run,"d5-stratify");complete(run,"d5-stratify");save(run,"d6-conclusion",input("d6-conclusion"));complete(run,"d6-conclusion");
        return runs.taskComplete(student,run.runId(),key(),new RunDtos.Revision(current(run).revision()));
    }
    RunDtos.Run close(RunDtos.Run run){var view=reflection.get(student,run.runId());return reflection.submit(student,run.runId(),key(),new RunDtos.ReflectionSave(view.revision(),view.questionSetVersion(),answer(view.definition().path("inputSchema"),0)));}
    @Test void oldSuccessReusedAfterFiftyOneFailuresStaysCurrentAndIsFrozenIntoEvidence(){
        var run=toQuality();save(run,"d2-quality",input("d2-quality"));var first=calculate(run,"d2-quality");var original=request(run,"d2-quality");
        var forged=(ObjectNode)first.result().deepCopy();forged.put("retainedRows",forged.path("retainedRows").asInt()-1);
        for(int i=0;i<51;i++)base.error("EXECUTION_RESULT_MISMATCH",()->execute.execute(student,run.runId(),key(),new RunDtos.Execute(original.operationKey(),original.inputRevision(),mapper.createObjectNode(),null,forged,Map.of())));
        save(run,"d2-quality",input("d2-quality").put("duplicateReason","只改解释且复用旧成功结果，后续失败历史不能遮蔽当前有效结果"));var reused=calculate(run,"d2-quality");
        assertTrue(reused.reused());assertEquals(first.executionId(),reused.executionId());assertEquals(29,reused.remainingEvaluations());
        var history=runs.step(student,run.runId(),"d2-quality").executions();complete(run,"d2-quality");close(finishTask(run));
        var frozen=store.node(db.queryForObject("SELECT closed_input_manifest_json FROM mp_experience_run WHERE public_id=?",String.class,run.runId()));
        var lease=jobs.claim("test-ds-history-window");var items=jobs.build(lease);assertTrue(jobs.publish(lease,items));
        assertAll(
            ()->assertTrue(history.stream().anyMatch(e->e.executionId().equals(first.executionId())&&Objects.equals(e.appliedToRevision(),2L)),"Current success must not disappear behind the history window"),
            ()->assertEquals(51,history.size(),"Exactly fifty history rows plus the older current result; not an expanded history limit"),
            ()->assertEquals(4,frozen.path("executions").size(),"Closing must freeze all four required DS operations, not a paginated history"),
            ()->assertEquals(4,items.stream().filter(i->i.type().equals("VERIFIED_EXECUTION")).count()),
            ()->assertTrue(items.stream().anyMatch(i->i.key().equals("execution:"+first.executionId()))));
    }
    @Test void missingRequiredExecutionBindingRejectsCloseAndRollsBackReflection(){
        var run=toQuality();quality(run,input("d2-quality"));var finished=finishTask(run);long runId=store.owned(student,run.runId()).id();
        db.update("DELETE x FROM mp_response_execution x JOIN mp_execution_record e ON e.id=x.execution_record_id WHERE e.experience_run_id=? AND e.operation_key='ds-quality-clean'",runId);
        base.error("EVIDENCE_SOURCE_INVALID",()->close(finished));assertEquals("TASK_COMPLETED",current(run).status());assertEquals("DRAFT",reflection.get(student,run.runId()).status());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE owner_student_id=?",Integer.class,student.internalId()));
    }
    @Test void incompleteClosedExecutionManifestCannotPublishReadySnapshot(){
        var run=toQuality();quality(run,input("d2-quality"));close(finishTask(run));long runId=store.owned(student,run.runId()).id();
        var frozen=(ObjectNode)store.node(db.queryForObject("SELECT closed_input_manifest_json FROM mp_experience_run WHERE id=?",String.class,runId));((ArrayNode)frozen.path("executions")).remove(0);String hash=store.hash(frozen);
        db.update("UPDATE mp_experience_run SET closed_input_manifest_json=?,closed_input_sha256=? WHERE id=?",store.json(frozen),hash,runId);db.update("UPDATE mp_run_closure_request SET closed_input_sha256=? WHERE experience_run_id=?",hash,runId);
        db.update("UPDATE mp_background_job SET business_key=?,checkpoint_json=NULL WHERE target_id=? AND owner_student_id=?",ClosurePipeline.evidenceKey(run.runId(),hash,"ds-evidence-v1"),runId,student.internalId());
        var lease=jobs.claim("test-ds-incomplete-manifest");jobs.process(lease);
        assertEquals("FAILED",db.queryForObject("SELECT status FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot()));
        assertEquals("EVIDENCE_SOURCE_INVALID",db.queryForObject("SELECT failure_code FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot()));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_evidence_item WHERE evidence_snapshot_id=?",Integer.class,lease.snapshot()));
    }
    @Test void oldValidExecutionLinkCannotReplaceTheFinalFrozenAncestorVector(){
        var run=toRelationship();save(run,"d4-relationship",scatter());var original=calculate(run,"d4-relationship");complete(run,"d4-relationship");
        quality(run,input("d2-quality").put("duplicateReason","只更新分析文字但来源revision必须仍按最终关闭时的版本固定"));profile(run);var reused=calculate(run,"d4-relationship");
        assertEquals(original.executionId(),reused.executionId());assertEquals(Map.of("d2-quality",1L),reused.sourceRevisions());assertEquals(Map.of("d2-quality",2L),reused.appliedSourceRevisions());complete(run,"d4-relationship");
        save(run,"d5-stratify",input("d5-stratify"));calculate(run,"d5-stratify");complete(run,"d5-stratify");save(run,"d6-conclusion",input("d6-conclusion"));complete(run,"d6-conclusion");close(runs.taskComplete(student,run.runId(),key(),new RunDtos.Revision(current(run).revision())));
        long runId=store.owned(student,run.runId()).id();var frozen=(ObjectNode)store.node(db.queryForObject("SELECT closed_input_manifest_json FROM mp_experience_run WHERE id=?",String.class,runId));
        for(var execution:frozen.path("executions"))if(execution.path("stepKey").asText().equals("d4-relationship"))((ObjectNode)execution).set("sourceRevisions",mapper.valueToTree(Map.of("d2-quality",1L)));
        String hash=store.hash(frozen);db.update("UPDATE mp_experience_run SET closed_input_manifest_json=?,closed_input_sha256=? WHERE id=?",store.json(frozen),hash,runId);db.update("UPDATE mp_run_closure_request SET closed_input_sha256=? WHERE experience_run_id=?",hash,runId);
        db.update("UPDATE mp_background_job SET business_key=?,checkpoint_json=NULL WHERE target_id=? AND owner_student_id=?",ClosurePipeline.evidenceKey(run.runId(),hash,"ds-evidence-v1"),runId,student.internalId());
        var lease=jobs.claim("test-ds-old-valid-vector");jobs.process(lease);assertEquals("FAILED",db.queryForObject("SELECT status FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot()));assertEquals("EVIDENCE_SOURCE_INVALID",db.queryForObject("SELECT failure_code FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot()));
    }
}
