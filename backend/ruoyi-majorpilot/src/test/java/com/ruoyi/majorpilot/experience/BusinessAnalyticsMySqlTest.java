package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.businessanalytics.BaMetricsEngine;
import com.ruoyi.majorpilot.classifier.ClassifierEngine;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.datascience.DsStatsEngine;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static com.ruoyi.majorpilot.experience.ExperienceMySqlTest.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real dedicated MySQL transactions; synthetic fixture answers never become product defaults. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class BusinessAnalyticsMySqlTest {
    static final String VERSION="01JB1000000000000000000001";
    static final List<String> installed=new ArrayList<>();static JsonNode fixture;
    ExperienceMySqlTest base;RunStore store;RunService runs;PublishedTaskContentProvider provider;TaskContent.Version version;
    FixedExecutionCalculator calculator;ExecutionService execute;ClosurePipeline closure;ReflectionService reflection;EvidenceJobs jobs;StudentPrincipal student;
    @BeforeAll static void database()throws Exception{
        ExperienceMySqlTest.database();fixture=mapper.readTree(Files.readString(Path.of("../../contracts/examples/p5-ba-run.json")));
        for(String id:List.of(VERSION,ProfessionalMySqlTest.VERSION,DataScienceMySqlTest.VERSION))if(db.queryForObject("SELECT COUNT(*) FROM mp_task_version WHERE public_id=?",Integer.class,id)==0)installed.add(id);
        new TaskPublicationService(db,tx,repository,mapper,true,true).installEngineeringPreviews();
    }
    @AfterAll static void cleanupContent(){for(String id:installed)db.update("DELETE FROM mp_task_version WHERE public_id=? AND status='REVIEW'",id);installed.clear();}
    @BeforeEach void setup(){
        base=new ExperienceMySqlTest();base.fixture();student=base.student;store=new RunStore(db,mapper,true,true);provider=new PublishedTaskContentProvider(db,repository,true,true);version=provider.review(VERSION);runs=new RunService(store,provider,base.idem,tx);
        calculator=new FixedExecutionCalculator(provider,mapper,new ClassifierEngine(repository,mapper),new DsStatsEngine(repository,mapper),new BaMetricsEngine(repository,mapper));
        execute=new ExecutionService(runs,calculator,mock(RateLimits.class));closure=new ClosurePipeline(runs);reflection=new ReflectionService(runs,closure);jobs=new EvidenceJobs(runs,closure);
    }
    @AfterEach void cleanup(){if(student!=null){var cleaner=new ProfessionalMySqlTest();cleaner.student=student;cleaner.base=base;cleaner.cleanup();}}
    ObjectNode answer(String step){return (ObjectNode)fixture.path("responses").path(step).deepCopy();}
    RunDtos.Run start(){var ready=runs.createPreview(student,key(),new RunDtos.CreatePreview(VERSION));return runs.transition(student,ready.runId(),"start",key(),new RunDtos.Transition(ready.revision(),null,null));}
    RunDtos.Run current(RunDtos.Run run){return runs.get(student,run.runId());}
    RunDtos.Step view(RunDtos.Run run,String step){return runs.step(student,run.runId(),step);}
    RunDtos.Saved save(RunDtos.Run run,String step,JsonNode value){var old=view(run,step);return runs.save(student,run.runId(),step,new RunDtos.Save(old.revision(),old.responseSchemaVersion(),value));}
    RunDtos.Run complete(RunDtos.Run run,String step){var state=view(run,step);return runs.completeStep(student,run.runId(),step,key(),new RunDtos.StepCompletion(state.revision(),state.baActionContext()==null?null:state.baActionContext().sourceRevisions()));}
    RunDtos.Execute request(RunDtos.Run run,String step){var state=view(run,step);return new RunDtos.Execute(state.definition().path("operationKey").asText(),state.revision(),mapper.createObjectNode(),null,null,runs.sources(state.inputBindings()));}
    RunDtos.Execution calculate(RunDtos.Run run,String step){return execute.execute(student,run.runId(),key(),request(run,step));}
    void finish(RunDtos.Run run,String step){save(run,step,answer(step));if(!view(run,step).definition().path("operationKey").isNull())calculate(run,step);complete(run,step);}
    RunDtos.Run toMetric(){var run=start();finish(run,"b1-context");return current(run);}
    RunDtos.Run toFunnel(){var run=toMetric();finish(run,"b2-metric");return current(run);}
    RunDtos.Run toSegment(){var run=toFunnel();finish(run,"b3-funnel");return current(run);}
    RunDtos.Run toAction(){var run=toSegment();finish(run,"b4-segment");finish(run,"b5-hypothesis");return current(run);}
    long successes(RunDtos.Run run,String operation){return db.queryForObject("SELECT COUNT(*) FROM mp_execution_record e JOIN mp_experience_run r ON r.id=e.experience_run_id WHERE r.public_id=? AND e.operation_key=? AND e.status='SUCCEEDED'",Long.class,run.runId(),operation);}
    RunDtos.Run close(RunDtos.Run run){var task=runs.taskComplete(student,run.runId(),key(),new RunDtos.Revision(current(run).revision()));var ref=reflection.get(student,task.runId());return reflection.submit(student,task.runId(),key(),new RunDtos.ReflectionSave(ref.revision(),ref.questionSetVersion(),fixture.path("reflection").path("answers")));}

    @Test void b3CanCalculateBeforeChoosingFocusAndOnlyWindowsAffectItsConfiguration(){
        var run=toFunnel();assertEquals(0,view(run,"b3-funnel").revision());save(run,"b3-funnel",mapper.createObjectNode());var first=calculate(run,"b3-funnel");assertEquals(29,first.remainingEvaluations());assertEquals(Map.of("b2-metric",1L),first.appliedSourceRevisions());
        base.error("STEP_VALIDATION_FAILED",()->complete(run,"b3-funnel"));save(run,"b3-funnel",answer("b3-funnel"));var reused=calculate(run,"b3-funnel");assertTrue(reused.reused());assertEquals(first.executionId(),reused.executionId());assertEquals(2L,reused.appliedToRevision());complete(run,"b3-funnel");
        save(run,"b2-metric",answer("b2-metric").put("denominator","first_lesson_count"));calculate(run,"b2-metric");complete(run,"b2-metric");var again=calculate(run,"b3-funnel");assertTrue(again.reused());assertEquals(first.executionId(),again.executionId());assertEquals(Map.of("b2-metric",2L),again.appliedSourceRevisions());assertEquals(1,successes(run,"ba-funnel"));
    }
    @Test void v4RequiresExplicitSourcesEmptyParametersAndLegalWindowSemantics(){
        var run=toMetric();save(run,"b2-metric",answer("b2-metric"));var input=request(run,"b2-metric");
        base.error("VALIDATION_ERROR",()->execute.execute(student,run.runId(),key(),new RunDtos.Execute(input.operationKey(),input.inputRevision(),mapper.createObjectNode(),null,null)));
        base.error("EXECUTION_NOT_ALLOWED",()->execute.execute(student,run.runId(),key(),new RunDtos.Execute(input.operationKey(),input.inputRevision(),answer("b2-metric"),null,null,Map.of())));
        for(var invalid:List.of(answer("b2-metric").put("comparisonStartWeek",6),answer("b2-metric").put("baselineEndWeek",5),answer("b2-metric").put("baselineStartWeek",7))){save(run,"b2-metric",invalid);base.error("BA_PARAMETERS_INVALID",()->calculate(run,"b2-metric"));base.error("BA_PARAMETERS_INVALID",()->complete(run,"b2-metric"));}
        assertEquals(0,successes(run,"ba-metric"));
    }
    @Test void thirtyUniqueSuccessfulConfigurationsAndFreeReuseDoNotInheritAiBaseline(){
        var run=toMetric();var configs=new ArrayList<ObjectNode>();for(int a=1;a<=11;a++)for(int b=a+1;b<=12;b++)configs.add(answer("b2-metric").put("baselineStartWeek",a).put("baselineEndWeek",a).put("comparisonStartWeek",b).put("comparisonEndWeek",b));
        for(int i=0;i<30;i++){save(run,"b2-metric",configs.get(i));assertEquals(29-i,calculate(run,"b2-metric").remainingEvaluations());}
        save(run,"b2-metric",configs.get(30));base.error("EVALUATION_LIMIT_REACHED",()->calculate(run,"b2-metric"));save(run,"b2-metric",configs.getFirst());var reused=calculate(run,"b2-metric");assertTrue(reused.reused());assertEquals(0,reused.remainingEvaluations());assertEquals(30,successes(run,"ba-metric"));assertEquals(0,successes(run,"ba-funnel"));
    }
    @Test void changingSourceRevisionEvenToEqualParametersRejectsOldExecuteAndOldCompletion(){
        var run=toFunnel();save(run,"b3-funnel",answer("b3-funnel"));var old=request(run,"b3-funnel");calculate(run,"b3-funnel");complete(run,"b3-funnel");
        var saved=save(run,"b2-metric",answer("b2-metric").put("metricReason","只修改理由，但新的来源版本仍必须明确重新确认"));assertTrue(saved.invalidatedStepKeys().containsAll(List.of("b3-funnel","b4-segment","b5-hypothesis","b6-action")));calculate(run,"b2-metric");complete(run,"b2-metric");
        base.error("EXECUTION_REVISION_STALE",()->execute.execute(student,run.runId(),key(),old));base.error("EXECUTION_NOT_ALLOWED",()->complete(run,"b3-funnel"));assertTrue(view(run,"b3-funnel").executions().stream().allMatch(e->e.appliedToRevision()==null));assertTrue(calculate(run,"b3-funnel").reused());complete(run,"b3-funnel");
    }
    @Test void sourceMutationDuringCalculationIsFencedOutsideTheTransaction()throws Exception{
        var run=toFunnel();save(run,"b3-funnel",answer("b3-funnel"));var request=request(run,"b3-funnel");var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
        var delayed=new ExecutionCalculator(){public JsonNode normalize(TaskContent.Version v,JsonNode o,JsonNode p){return calculator.normalize(v,o,p);}public JsonNode calculate(TaskContent.Version v,JsonNode o,JsonNode p){assertFalse(TransactionSynchronizationManager.isActualTransactionActive());entered.countDown();try{assertTrue(release.await(10,TimeUnit.SECONDS));}catch(InterruptedException e){throw new IllegalStateException(e);}return calculator.calculate(v,o,p);}};
        try(var pool=Executors.newSingleThreadExecutor()){var task=pool.submit(()->assertThrows(ApiException.class,()->new ExecutionService(runs,delayed,mock(RateLimits.class)).execute(student,run.runId(),key(),request)).code);assertTrue(entered.await(5,TimeUnit.SECONDS));save(run,"b2-metric",answer("b2-metric").put("metricReason","并发标签修改了上游理由，不能把旧来源结果绑定成新来源"));calculate(run,"b2-metric");complete(run,"b2-metric");release.countDown();assertEquals("EXECUTION_REVISION_STALE",task.get(10,TimeUnit.SECONDS));}finally{release.countDown();}
        assertEquals(0,successes(run,"ba-funnel"));
    }
    @Test void priorityMustBelongToCurrentDimensionButPriorityIsNotCalculationConfig(){
        var run=toSegment();save(run,"b4-segment",answer("b4-segment").put("segmentBy","signup_source"));var first=calculate(run,"b4-segment");base.error("BA_PARAMETERS_INVALID",()->complete(run,"b4-segment"));
        save(run,"b4-segment",answer("b4-segment").put("segmentBy","signup_source").put("prioritySegmentKey","PARTNER"));var reused=calculate(run,"b4-segment");assertTrue(reused.reused());assertEquals(first.executionId(),reused.executionId());complete(run,"b4-segment");finish(run,"b5-hypothesis");var context=view(run,"b6-action").baActionContext();assertEquals("PARTNER",context.prioritySegmentKey());assertEquals("signup_source",context.parameters().path("segmentBy").asText());assertFalse(mapper.valueToTree(context).has("segments"));
    }
    @Test void b6MissingOrStaleSourcesFailAndFreshConfirmationWorksWithoutConsumingQuota(){
        var run=toAction();var before=view(run,"b6-action").baActionContext();assertEquals(Map.of("b2-metric",1L,"b3-funnel",1L,"b4-segment",1L),before.sourceRevisions());save(run,"b6-action",answer("b6-action"));
        var stale=new RunDtos.StepCompletion(1L,before.sourceRevisions());base.error("STEP_VALIDATION_FAILED",()->runs.completeStep(student,run.runId(),"b6-action",key(),new RunDtos.StepCompletion(1L)));
        save(run,"b4-segment",answer("b4-segment").put("priorityReason","同一群体但重新确认的理由也必须形成来源版本冲突"));calculate(run,"b4-segment");complete(run,"b4-segment");complete(run,"b5-hypothesis");
        base.error("STEP_SOURCE_REVISION_CONFLICT",()->runs.completeStep(student,run.runId(),"b6-action",key(),stale));assertEquals("IN_PROGRESS",view(run,"b6-action").status());assertEquals(1,view(run,"b6-action").revision());
        var fresh=view(run,"b6-action").baActionContext();String receipt=key();var confirmed=new RunDtos.StepCompletion(1L,fresh.sourceRevisions());var completed=runs.completeStep(student,run.runId(),"b6-action",receipt,confirmed);
        save(run,"b4-segment",answer("b4-segment").put("priorityReason","后续改动不能阻止已成功幂等凭据重放，也不能改写其原结果"));calculate(run,"b4-segment");complete(run,"b4-segment");complete(run,"b5-hypothesis");
        assertEquals(completed,runs.completeStep(student,run.runId(),"b6-action",receipt,confirmed));assertEquals("IN_PROGRESS",view(run,"b6-action").status());
        base.error("IDEMPOTENCY_KEY_REUSED",()->runs.completeStep(student,run.runId(),"b6-action",receipt,new RunDtos.StepCompletion(1L,view(run,"b6-action").baActionContext().sourceRevisions())));
        assertEquals(0,successes(run,"b6-action"));assertEquals(1,successes(run,"ba-segments"));
    }
    @Test void b6RejectsInvalidTargetsConditionalMetricAndOverHundredPercentButAllowsTighterGuardrails(){
        var run=toAction();
        for(var invalid:List.of(answer("b6-action").put("targetSegmentKey","FOUNDATIONS"),answer("b6-action").put("successMetric","STARTER_COMPLETION_RATE"),answer("b6-action").put("targetChangePercentagePoints",100))){save(run,"b6-action",invalid);base.error("BA_ACTION_INVALID",()->complete(run,"b6-action"));}
        save(run,"b6-action",answer("b6-action").put("guardrailMaximum",0).put("reviewAfterDays",42));assertDoesNotThrow(()->complete(run,"b6-action"));
    }
    @Test void b6AllowsStarterRateOnlyAfterTheSavedMetricAndAllSourcesAreRevalidated(){
        var run=toMetric();save(run,"b2-metric",answer("b2-metric").put("denominator","first_lesson_count"));calculate(run,"b2-metric");complete(run,"b2-metric");for(String step:List.of("b3-funnel","b4-segment","b5-hypothesis"))finish(run,step);
        var context=view(run,"b6-action").baActionContext();assertEquals("first_lesson_count",context.parameters().path("denominator").asText());assertTrue(context.comparison().path("supportContactsPer100Enrolled").asDouble()>100);
        save(run,"b6-action",answer("b6-action").put("successMetric","STARTER_COMPLETION_RATE").put("reviewAfterDays",42));complete(run,"b6-action");
    }
    @Test void missingCurrentSegmentBindingCannotBeReplacedByHistoricalResultForAction(){
        var run=toAction();long runId=store.owned(student,run.runId()).id();db.update("DELETE x FROM mp_response_execution x JOIN mp_execution_record e ON e.id=x.execution_record_id WHERE e.experience_run_id=? AND e.operation_key='ba-segments'",runId);
        base.error("EXECUTION_REVISION_STALE",()->view(run,"b6-action"));
    }
    @Test void fiftyOneFailuresDoNotHideOldReusedCurrentResultOrOmitFrozenOperations(){
        var run=toMetric();save(run,"b2-metric",answer("b2-metric"));var first=calculate(run,"b2-metric");var request=request(run,"b2-metric");var forged=(ObjectNode)first.result().deepCopy();((ObjectNode)forged.path("comparison")).put("numeratorCount",0);
        for(int i=0;i<51;i++)base.error("EXECUTION_RESULT_MISMATCH",()->execute.execute(student,run.runId(),key(),new RunDtos.Execute(request.operationKey(),request.inputRevision(),mapper.createObjectNode(),null,forged,Map.of())));
        save(run,"b2-metric",answer("b2-metric").put("metricReason","保留旧的成功结果，失败历史分页不能切断当前执行与关闭证据"));var reused=calculate(run,"b2-metric");assertEquals(first.executionId(),reused.executionId());assertEquals(29,reused.remainingEvaluations());assertEquals(51,view(run,"b2-metric").executions().size());complete(run,"b2-metric");for(String step:List.of("b3-funnel","b4-segment","b5-hypothesis","b6-action"))finish(run,step);close(run);
        var frozen=store.node(db.queryForObject("SELECT closed_input_manifest_json FROM mp_experience_run WHERE public_id=?",String.class,run.runId()));assertEquals("ba-evidence-v1",frozen.path("evidenceRuleVersion").asText());assertEquals(3,frozen.path("executions").size());
        var lease=jobs.claim("test-ba-history");var items=jobs.build(lease);assertTrue(jobs.publish(lease,items));assertEquals(3,items.stream().filter(i->i.type().equals("VERIFIED_EXECUTION")).count());assertTrue(items.stream().anyMatch(i->i.key().equals("execution:"+first.executionId())));
    }
    @Test void closePreservesFrozenRuleAndBusinessAnalysisNeverBecomesVerifiedEffect(){
        var run=toAction();String invented="这一行动已经保证所有学员完成并创造真实收入";save(run,"b6-action",answer("b6-action").put("actionReason",invented));complete(run,"b6-action");assertEquals("NOT_APPLICABLE",close(run).reportStatus());
        var lease=jobs.claim("test-ba-evidence");assertEquals("ba-evidence-v1",lease.rule());var items=jobs.build(lease);assertTrue(jobs.publish(lease,items));assertEquals(3,items.stream().filter(i->i.type().equals("VERIFIED_EXECUTION")).count());assertEquals(6,items.stream().filter(i->i.type().equals("STUDENT_ANALYSIS")).count());
        for(var item:items)if(item.value().toString().contains(invented)||item.value().has("targetChangePercentagePoints")||item.value().path("answers").has("targetChangePercentagePoints")){assertEquals("STUDENT_ANALYSIS",item.type());assertTrue(item.claims().isEmpty());assertEquals("UNVERIFIED",item.value().path("verificationStatus").asText());}
        assertTrue(items.stream().anyMatch(i->i.value().toString().contains(invented)));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_report WHERE student_id=?",Integer.class,student.internalId()));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_recommendation WHERE student_id=?",Integer.class,student.internalId()));assertEquals(Set.of("ba-evidence-v1"),new HashSet<>(db.queryForList("SELECT rule_version FROM mp_evidence_item WHERE evidence_snapshot_id=?",String.class,lease.snapshot())));
    }
    @Test void contentIntegrityFailureRetains503AndIsNotChargedAsSuccessfulConfiguration(){
        var run=toMetric();save(run,"b2-metric",answer("b2-metric"));var broken=new ExecutionCalculator(){public JsonNode normalize(TaskContent.Version v,JsonNode o,JsonNode p){return calculator.normalize(v,o,p);}public JsonNode calculate(TaskContent.Version v,JsonNode o,JsonNode p){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}};
        var input=request(run,"b2-metric");String receipt=key();var service=new ExecutionService(runs,broken,mock(RateLimits.class));assertEquals(503,assertThrows(ApiException.class,()->service.execute(student,run.runId(),receipt,input)).status);assertEquals(503,assertThrows(ApiException.class,()->service.execute(student,run.runId(),receipt,input)).status);assertEquals(0,successes(run,"ba-metric"));assertEquals(29,calculate(run,"b2-metric").remainingEvaluations());
    }
}
