package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.learning.*;
import com.ruoyi.majorpilot.integration.ai.MethodReportGateway;
import com.ruoyi.majorpilot.recommendation.NextRecommendations;
import com.ruoyi.majorpilot.report.*;
import com.ruoyi.majorpilot.report.core.*;
import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.ruoyi.majorpilot.experience.ExperienceMySqlTest.*;

/** Isolated test database only; synthetic model output verifies persistence, not semantic quality. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class MethodLearningMySqlTest {
    static final Map<String,String> IDS=Map.of("AI","01JA2000000000000000000001","DATA_SCIENCE","01JD2000000000000000000001","BUSINESS_ANALYTICS","01JB2000000000000000000001");
    static final Set<String> installed=new HashSet<>();
    ProfessionalMySqlTest f;GuidedLearning learning;MethodReports reports;MethodReportWorker worker;MethodReportGateway gateway;WorkbookCatalog books;
    @BeforeAll static void database(){ProfessionalMySqlTest.database();for(String id:IDS.values())if(db.queryForObject("SELECT COUNT(*) FROM mp_experience_run WHERE task_version_id=(SELECT id FROM mp_task_version WHERE public_id=?)",Integer.class,id)==0)installed.add(id);}
    @AfterAll static void removeFixtures(){for(String id:installed)db.update("DELETE FROM mp_task_version WHERE public_id=? AND status='REVIEW'",id);ProfessionalMySqlTest.removeOwnedContentFixture();}
    @BeforeEach void setup(){mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);f=new ProfessionalMySqlTest();f.setup();books=new WorkbookCatalog(mapper,repository);learning=new GuidedLearning(f.store,f.provider,books);f.runs.guidedLearning(learning);reports=new MethodReports(f.store,f.provider,learning,new NextRecommendations(db,mapper));f.closure.methodPipeline(learning,reports);
        gateway=mock(MethodReportGateway.class);when(gateway.enabled()).thenReturn(true);when(gateway.provider()).thenReturn("SYNTHETIC");when(gateway.model()).thenReturn("offline-fixture");when(gateway.call(any(),nullable(JsonNode.class),anyBoolean())).thenAnswer(call->new MethodReportGateway.Result(MethodReportContractTest.proposal(mapper,call.getArgument(0)),"SYNTHETIC","offline-fixture",0L,0L,0L,1,null));worker=new MethodReportWorker(f.store,tx,reports,gateway);
    }
    @AfterEach void cleanup(){worker.close();f.cleanup();for(String id:IDS.values())db.update("UPDATE mp_task_version SET status='REVIEW' WHERE public_id=?",id);}
    RunDtos.Run start(String major){String id=IDS.get(major);db.update("UPDATE mp_task_version SET status='PUBLISHED' WHERE public_id=?",id);f.version=f.provider.pinned(id);long profile=db.queryForObject("SELECT id FROM mp_decision_profile WHERE student_id=?",Long.class,f.student.internalId());String rec=PublicIds.next(),decision=PublicIds.next();
        db.update("INSERT INTO mp_recommendation(public_id,student_id,decision_profile_id,recommendation_type,completed_major_codes_json,rule_version,primary_major_code,alternative_order_json,tie_detected,explanation_status,explanation_version,safe_result_json,generated_at) VALUES(?,?,?,'INITIAL','[]',?,?,'[]',FALSE,'STRUCTURED_ONLY','test-only','{}',UTC_TIMESTAMP(3))",rec,f.student.internalId(),profile,"test-"+major,major);
        long recId=db.queryForObject("SELECT id FROM mp_recommendation WHERE public_id=?",Long.class,rec);
        db.update("INSERT INTO mp_recommendation_decision(public_id,recommendation_id,student_id,decision_no,decision_type,selected_major_code,decided_at) VALUES(?,?,?,1,'ACCEPTED',?,UTC_TIMESTAMP(3))",decision,recId,f.student.internalId(),major);
        return f.start(f.runs.create(f.student,key(),new RunDtos.Create(decision,null,null)));
    }
    RunStore.Row row(RunDtos.Run run){return f.store.owned(f.student,run.runId());}
    @SuppressWarnings("unchecked") void event(RunDtos.Run run,String step,String cp,String kind,String support,String role){var history=learning.events(row(run));Long revision=role==null?null:f.runs.step(f.student,run.runId(),step).revision();var body=new GuidedLearning.Change(history.size(),revision,step,kind,cp,support,role);f.runs.writeOwned(f.student,run.runId(),"/experience-runs/"+run.runId()+"/learning/events",key(),body,Map.class,()->learning.change(row(run),body));}
    ObjectNode answer(RunDtos.Run run,JsonNode definition,JsonNode guideStep)throws Exception{var value=(ObjectNode)f.value(definition.path("inputSchema"),0);if(!guideStep.path("local").isNull()){var book=books.list(f.version).getFirst();var local=value.withObject("local");local.put("workbookVersion",book.workbookVersion()).put("workbookSha256",book.sha256());var spec=guideStep.at("/local/defaultSpecification").deepCopy();local.set("specification",spec);var data=mapper.readTree(f.provider.publicAsset(f.version,run.majorCode().equals("DATA_SCIENCE")?"learner-activity":"weekly-funnel").bytes());var values=local.putObject("values");LocalResultVerifier.calculate(run.majorCode(),spec,data).forEach((k,v)->{var rounded=v.rounded(v.unit()==LocalResultVerifier.Unit.COUNT?0:2);values.put(k,rounded==null?"UNDEFINED":rounded.toPlainString());});}return value;}
    RunDtos.Run close(String major)throws Exception{return close(major,false);}
    RunDtos.Run close(String major,boolean skipTransfer)throws Exception{
        var run=start(major);var guide=learning.guide(row(run));
        for(var definition:f.version.manifest().path("steps")){String step=definition.path("stepKey").asText();var gs=MethodGuide.step(guide.path("steps"),step);String cp=gs.path("checkpointId").asText(null),transfer=gs.path("transferCheckpointId").asText(null);
            if(cp!=null)event(run,step,cp,"SUPPORT_PROVIDED",cp.toLowerCase()+"-basic",null);
            var value=answer(run,definition,gs);if(skipTransfer&&transfer!=null)value.put("transferMode","SKIP").put("transfer","");var saved=f.save(run,step,value);
            if(value.has("local"))tx.executeWithoutResult(t->learning.check(row(run),new GuidedLearning.Check(step,saved.revision(),false)));
            if(!definition.path("operationKey").asText("").isBlank())f.execute.execute(f.student,run.runId(),key(),new RunDtos.Execute(definition.path("operationKey").asText(),saved.revision(),mapper.createObjectNode(),null,null));
            if(cp!=null)event(run,step,cp,"ATTEMPT_SUBMITTED",null,"INITIAL");if(transfer!=null&&!skipTransfer)event(run,step,transfer,"ATTEMPT_SUBMITTED",null,"TRANSFER");
            f.runs.completeStep(f.student,run.runId(),step,key(),new RunDtos.Revision(saved.revision()));
        }
        var current=f.current(run);return f.close(f.runs.taskComplete(f.student,current.runId(),key(),new RunDtos.Revision(current.revision())));
    }
    void publish(){var lease=worker.claim();assertNotNull(lease);worker.process(lease);assertEquals("READY",db.queryForObject("SELECT status FROM mp_report_version WHERE id=?",String.class,lease.version()),()->db.queryForMap("SELECT status,failure_code FROM mp_report_version WHERE id=?",lease.version()).toString());}
    @Test void allThreeFlowsFreezePublishReviewAndCompareWithoutPaidCalls()throws Exception{
        for(String major:List.of("BUSINESS_ANALYTICS","DATA_SCIENCE","AI")){var closed=close(major);assertEquals("CLOSED",closed.status());assertEquals("GENERATING",closed.reportStatus());assertEquals(2,closed.experienceEdition());
            if("true".equals(System.getenv("MP_METHOD_EXPORT"))){var dir=java.nio.file.Path.of("../../data/method-quality/base");java.nio.file.Files.createDirectories(dir);java.nio.file.Files.writeString(dir.resolve(major+".json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(reports.input(row(closed))));}
            publish();if(!major.equals("BUSINESS_ANALYTICS"))publish();}
        assertEquals(4,db.queryForObject("SELECT COUNT(*) FROM mp_report WHERE student_id=? AND status='READY'",Integer.class,f.student.internalId()));assertEquals(10,db.queryForObject("SELECT COUNT(*) FROM mp_ai_call WHERE student_id=? AND status='SUCCEEDED'",Integer.class,f.student.internalId()));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=? AND v.status='READY' AND (v.review_invocation_id IS NULL OR v.reviewed_proposal_sha256 IS NULL)",Integer.class,f.student.internalId()));
        var published=db.queryForList("SELECT structured_report_json FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=? AND v.status='READY'",f.student.internalId());for(var p:published){var body=f.store.node(p.get("structured_report_json"));assertTrue(new ReportSchema(mapper).output(body));assertTrue(body.path("calculationConditions").isArray());for(var condition:body.path("calculationConditions"))assertEquals("MATCHED",condition.path("verificationStatus").asText());}
    }
    @Test void completionCannotBypassExplicitLearningAndWrongConceptDoesNotBlock()throws Exception{
        var run=start("BUSINESS_ANALYTICS");String step="b1-context";var definition=f.definition(step);var answer=(ObjectNode)f.value(definition.path("inputSchema"),0);var saved=f.save(run,step,answer);assertEquals("LEARNING_SUBMISSION_REQUIRED",assertThrows(ApiException.class,()->f.runs.completeStep(f.student,run.runId(),step,key(),new RunDtos.Revision(saved.revision()))).code);
        event(run,step,"BA-C1","SUPPORT_PROVIDED","ba-c1-basic",null);event(run,step,"BA-C1","ATTEMPT_SUBMITTED",null,"INITIAL");event(run,step,"BA-C1","SUPPORT_PROVIDED","ba-c1-hint-1",null);event(run,step,"BA-C1","CONTINUE_WITH_SUPPORT",null,null);assertDoesNotThrow(()->f.runs.completeStep(f.student,run.runId(),step,key(),new RunDtos.Revision(saved.revision())));
    }
    @Test void independentReviewFailureDoesNotPublishDraftOrPretendFallback()throws Exception{close("BUSINESS_ANALYTICS");doReturn(new MethodReportGateway.Result(null,"SYNTHETIC","offline-fixture",null,null,null,1,"TIMEOUT")).when(gateway).call(any(),any(),eq(true));var lease=worker.claim();worker.process(lease);assertEquals("FAILED",db.queryForObject("SELECT status FROM mp_report_version WHERE id=?",String.class,lease.version()));assertNull(db.queryForObject("SELECT current_version_id FROM mp_report WHERE student_id=?",Long.class,f.student.internalId()));assertEquals(2,db.queryForObject("SELECT http_attempt_count FROM mp_report_version WHERE id=?",Integer.class,lease.version()));}
    @Test void uncertainInFlightCallIsNotRepeated()throws Exception{close("BUSINESS_ANALYTICS");var lease=worker.claim();db.update("UPDATE mp_report_version SET generation_phase='INITIAL_REQUESTED',http_attempt_count=1 WHERE id=?",lease.version());worker.process(lease);verify(gateway,never()).call(any(),any(),anyBoolean());assertEquals("METHOD_CALL_OUTCOME_UNKNOWN",db.queryForObject("SELECT failure_code FROM mp_report_version WHERE id=?",String.class,lease.version()));}
    @Test void frozenInputTamperingFailsBeforeAnyExternalCall()throws Exception{close("DATA_SCIENCE");var lease=worker.claim();db.update("UPDATE mp_report_version SET input_manifest_json=JSON_SET(input_manifest_json,'$.reportType','COMPARISON') WHERE id=?",lease.version());worker.process(lease);verify(gateway,never()).call(any(),any(),anyBoolean());assertEquals("REPORT_SOURCE_INVALID",db.queryForObject("SELECT failure_code FROM mp_report_version WHERE id=?",String.class,lease.version()));}
    @Test void explicitTransferSkipCanCloseAndNeverFabricatesAnAttempt()throws Exception{
        var run=close("BUSINESS_ANALYTICS",true);assertEquals("CLOSED",run.status());assertTrue(learning.events(row(run)).stream().noneMatch(e->e.payload().path("role").asText().equals("TRANSFER")));
        var input=reports.input(row(run));assertTrue(input.path("sources").findValuesAsText("value").stream().anyMatch(v->v.contains("学生明确选择这次不作答")));publish();
    }
    @Test void failedRegenerationKeepsReadablePublishedVersionAndExport()throws Exception{
        var run=close("DATA_SCIENCE");publish();var prior=db.queryForMap("SELECT public_id,current_version_id FROM mp_report WHERE experience_run_id=?",row(run).id());
        tx.executeWithoutResult(t->reports.regenerate(f.student.internalId(),prior.get("public_id").toString()));doReturn(new MethodReportGateway.Result(null,"SYNTHETIC","offline-fixture",null,null,null,1,"TIMEOUT")).when(gateway).call(any(),any(),eq(true));var lease=worker.claim();worker.process(lease);
        assertEquals(((Number)prior.get("current_version_id")).longValue(),db.queryForObject("SELECT current_version_id FROM mp_report WHERE experience_run_id=?",Long.class,row(run).id()));assertEquals("READY",db.queryForObject("SELECT status FROM mp_report WHERE experience_run_id=?",String.class,row(run).id()));
        byte[] zip=tx.execute(t->new com.ruoyi.majorpilot.privacy.PersonalExportWriter(db,mapper).build(f.student.internalId(),"FULL_PERSONAL_EXPORT",java.time.Instant.now()));assertNotNull(zip);assertTrue(zip.length>1000);
    }
    @Test void deletionFencePreventsExternalCallsAndLatePublication()throws Exception{
        close("BUSINESS_ANALYTICS");var lease=worker.claim();db.update("UPDATE mp_student_account SET status='DELETION_PENDING' WHERE id=?",f.student.internalId());
        try{worker.process(lease);verify(gateway,never()).call(any(),nullable(JsonNode.class),anyBoolean());assertNull(db.queryForObject("SELECT current_version_id FROM mp_report WHERE student_id=?",Long.class,f.student.internalId()));}finally{db.update("UPDATE mp_student_account SET status='ACTIVE' WHERE id=?",f.student.internalId());}
    }
    @Test void explicitEditionKeepsHistoricalAnswersAndPauseState()throws Exception{
        var old=f.toEvaluation(f.formal());String before=db.queryForObject("SELECT JSON_ARRAYAGG(response_json) FROM mp_step_response_revision r JOIN mp_step_state s ON s.id=r.step_state_id WHERE s.experience_run_id=?",String.class,row(old).id());
        db.update("UPDATE mp_task_version SET status='RETIRED' WHERE public_id=?",ProfessionalMySqlTest.VERSION);db.update("UPDATE mp_task_version SET status='PUBLISHED' WHERE public_id=?",IDS.get("AI"));String key=key();var input=new RunDtos.Revision(f.current(old).revision());var fresh=f.runs.newEdition(f.student,old.runId(),key,input);assertEquals(fresh.runId(),f.runs.newEdition(f.student,old.runId(),key,input).runId());
        assertNotEquals(old.runId(),fresh.runId());assertEquals(2,fresh.experienceEdition());var current=f.current(old);f.runs.transition(f.student,fresh.runId(),"start",key(),new RunDtos.Transition(fresh.revision(),old.runId(),current.revision()));assertEquals("PAUSED",f.current(old).status());assertEquals(old.taskVersionId(),f.current(old).taskVersionId());
        assertEquals(before,db.queryForObject("SELECT JSON_ARRAYAGG(response_json) FROM mp_step_response_revision r JOIN mp_step_state s ON s.id=r.step_state_id WHERE s.experience_run_id=?",String.class,row(old).id()));
    }
    @Test void learningReplayPreservesSequenceAndChecksCurrentOwnershipBeforeReturningReceipt(){
        var run=start("BUSINESS_ANALYTICS");var body=new GuidedLearning.Change(0,null,"b1-context","SUPPORT_PROVIDED","BA-C1","ba-c1-basic",null);String idem=key(),path="/experience-runs/"+run.runId()+"/learning/events";
        f.runs.writeOwned(f.student,run.runId(),path,idem,body,Map.class,()->learning.change(row(run),body));
        f.runs.writeOwned(f.student,run.runId(),path,idem,body,Map.class,()->{fail("Receipt replay must not append a second event");return Map.of();});assertEquals(1,learning.events(row(run)).size());
        var current=f.current(run);f.runs.transition(f.student,run.runId(),"pause",key(),new RunDtos.Transition(current.revision(),null,null));assertEquals("RUN_PAUSED",assertThrows(ApiException.class,()->event(run,"b1-context","BA-C1","SUPPORT_PROVIDED","ba-c1-hint-1",null)).code);
        db.update("UPDATE mp_student_account SET status='LOCKED' WHERE id=?",f.student.internalId());try{assertThrows(ApiException.class,()->f.runs.writeOwned(f.student,run.runId(),path,idem,body,Map.class,()->Map.of()));}finally{db.update("UPDATE mp_student_account SET status='ACTIVE' WHERE id=?",f.student.internalId());}
    }
}
