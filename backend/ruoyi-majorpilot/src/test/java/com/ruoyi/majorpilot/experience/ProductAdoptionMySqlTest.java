package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.acceptance.*;
import com.ruoyi.majorpilot.auth.*;
import com.ruoyi.majorpilot.analytics.*;
import com.ruoyi.majorpilot.content.PublishedTaskContentProvider;
import com.ruoyi.majorpilot.privacy.*;
import com.ruoyi.majorpilot.recommendation.*;
import com.ruoyi.majorpilot.report.*;
import com.ruoyi.majorpilot.report.core.ReportModels.*;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.io.*;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static com.ruoyi.majorpilot.experience.ExperienceMySqlTest.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Dedicated majorpilot_test only. Synthetic content, real closure/report/privacy transactions, zero provider traffic. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class ProductAdoptionMySqlTest {
    @TempDir Path folder;
    ReportMySqlTest fixture;ExperienceMySqlTest other;ProductAdoptionService service;LocalProductAccess access;
    RunDtos.Run closed;long run,snapshot,operator;String closedSha,snapshotSha,receipt;PrivacyJobs privacyJobs;
    static final String REFERENCE="SYNTHETIC_PRODUCT_ADOPTION_V9";
    @BeforeAll static void database(){ReportMySqlTest.database();assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='9' AND success=1",Integer.class));}
    @AfterAll static void contentCleanup(){ReportMySqlTest.contentCleanup();}
    @BeforeEach void setup()throws Exception{
        fixture=new ReportMySqlTest();fixture.setup();other=new ExperienceMySqlTest();other.fixture();
        operator=db.queryForObject("SELECT MIN(user_id) FROM sys_user",Long.class);
        db.update("UPDATE mp_task_version SET status='REVIEW' WHERE public_id=?",fixture.fixtureId);
        access=new LocalProductAccess(db,true);fixture.f.provider.localProductAccess(access);
        service=new ProductAdoptionService(fixture.f.runs,access,fixture.fixtures,fixture.f.closure,fixture.coordinator);
        var preview=fixture.f.runs.createPreview(fixture.f.student,key(),new RunDtos.CreatePreview(fixture.fixtureId));
        closed=fixture.f.close(fixture.f.toReflection(fixture.f.toEvaluation(preview)));
        run=db.queryForObject("SELECT id FROM mp_experience_run WHERE public_id=?",Long.class,closed.runId());
        var lease=fixture.f.jobs.claim("adoption-v9-evidence");assertNotNull(lease);assertEquals(run,lease.run());fixture.f.jobs.process(lease);snapshot=lease.snapshot();
        assertEquals("READY",db.queryForObject("SELECT status FROM mp_evidence_snapshot WHERE id=?",String.class,snapshot));
        closedSha=db.queryForObject("SELECT closed_input_sha256 FROM mp_experience_run WHERE id=?",String.class,run);
        snapshotSha=db.queryForObject("SELECT snapshot_sha256 FROM mp_evidence_snapshot WHERE id=?",String.class,snapshot);
    }
    @AfterEach void cleanup(){
        if(privacyJobs!=null)privacyJobs.stop();if(fixture==null)return;
        db.update("DELETE FROM mp_run_product_adoption WHERE student_id=? OR experience_run_id=?",student(),run);
        for(String id:fixture.fixtureIds.values()){
            db.update("DELETE FROM mp_local_task_release WHERE task_version_id IN (SELECT id FROM mp_task_version WHERE public_id=?)",id);
            db.update("DELETE FROM mp_sensitive_audit WHERE target_type='TASK_VERSION' AND target_public_id=?",id);
        }
        db.update("DELETE FROM mp_sensitive_audit WHERE owner_student_id=?",student());
        db.update("DELETE FROM mp_account_deletion_request WHERE student_id=?",student());if(receipt!=null)db.update("DELETE FROM mp_account_deletion_request WHERE receipt_id=?",receipt);
        db.update("DELETE FROM mp_student_data_export WHERE student_id=?",student());
        fixture.cleanup();if(other!=null)other.cleanup();
    }
    long student(){return fixture.f.student.internalId();}
    ProductAdoptionService.Release releaseInput(){var row=db.queryForMap("SELECT row_version,manifest_sha256 FROM mp_task_version WHERE public_id=?",fixture.fixtureId);return new ProductAdoptionService.Release(((Number)row.get("row_version")).longValue(),(String)row.get("manifest_sha256"),REFERENCE,"Synthetic local owner authorization, not human content approval");}
    void release(){service.release(fixture.fixtureId,releaseInput(),operator,"synthetic-v9");}
    ProductAdoptionService.Adopt input(){return new ProductAdoptionService.Adopt(closed.revision(),closedSha,db.queryForObject("SELECT public_id FROM mp_evidence_snapshot WHERE id=?",String.class,snapshot),REFERENCE,"Synthetic exact historical adoption for isolated regression");}
    Map<String,Object> adopt(){release();return service.adopt(closed.runId(),input(),operator,"synthetic-v9");}
    Map<String,Object> report(){return db.queryForMap("SELECT * FROM mp_report WHERE experience_run_id=?",run);}
    void assertError(String code,org.junit.jupiter.api.function.Executable body){assertEquals(code,assertThrows(ApiException.class,body).code);}
    void unchanged(){assertEquals("REVIEW_PREVIEW",db.queryForObject("SELECT run_mode FROM mp_experience_run WHERE id=?",String.class,run));assertEquals(closedSha,db.queryForObject("SELECT closed_input_sha256 FROM mp_experience_run WHERE id=?",String.class,run));assertEquals(snapshotSha,db.queryForObject("SELECT snapshot_sha256 FROM mp_evidence_snapshot WHERE id=?",String.class,snapshot));}

    @Test void releaseIsExplicitHashPinnedAndNeverClaimsHumanReview(){
        var before=db.queryForMap("SELECT status,review_checks_json,reviewed_by_operator_id FROM mp_task_version WHERE public_id=?",fixture.fixtureId);
        var disabled=new ProductAdoptionService(fixture.f.runs,new LocalProductAccess(db,false),fixture.fixtures,fixture.f.closure,fixture.coordinator);
        assertError("LOCAL_PRODUCT_DISABLED",()->disabled.release(fixture.fixtureId,releaseInput(),operator,"test"));
        var request=releaseInput();assertError("CONTENT_VERSION_IMMUTABLE",()->service.release(fixture.fixtureId,new ProductAdoptionService.Release(request.expectedRevision(),"0".repeat(64),REFERENCE,request.reasonText()),operator,"test"));
        var first=service.release(fixture.fixtureId,request,operator,"test");assertEquals(first,service.release(fixture.fixtureId,request,operator,"test"));
        assertEquals(before,db.queryForMap("SELECT status,review_checks_json,reviewed_by_operator_id FROM mp_task_version WHERE public_id=?",fixture.fixtureId));
        assertEquals(fixture.fixtureId,fixture.f.provider.currentMajor("AI").taskVersionId());
        var off=new PublishedTaskContentProvider(db,fixture.fixtures,true,false);off.localProductAccess(new LocalProductAccess(db,false));assertEquals(fixture.fixtureId,off.pinned(fixture.fixtureId).taskVersionId());assertError("CONTENT_UNAVAILABLE",()->off.currentMajor("AI"));
    }

    @Test void exactPreviewAdoptionProducesNormalReportNextAndTwoMajorComparisonWithoutRewritingHistory()throws Exception{
        assertError("REPORT_SOURCE_INVALID",()->fixture.reports.source(student(),snapshot,null));
        var accepted=adopt();assertEquals(accepted,service.adopt(closed.runId(),input(),operator,"test-replay"));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_report_version WHERE report_id=?",Integer.class,ReportStore.n(report(),"id")));
        var input=fixture.reports.input(fixture.version(report()));assertEquals("REVIEW_PREVIEW",input.sources().getFirst().pins().runMode());assertNotNull(input.sources().getFirst().pins().productAuthorization());
        var next=new NextRecommendations(db,mapper).latest(student());assertEquals("DATA_SCIENCE",next.primaryMajor());assertEquals(List.of("AI"),next.completedMajorCodes());assertEquals("EXPLICIT_NEXT_STYLE",next.reasons().getFirst().code());
        var worker=fixture.worker(fixture.off());var reportLease=worker.claim("adopted-report");worker.process(reportLease);assertEquals("READY",fixture.reports.version(reportLease.version()).get("status"));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_ai_call WHERE report_version_id=?",Integer.class,reportLease.version()));
        fixture.prepareAdditional("DATA_SCIENCE");worker.process(worker.claim("standard-ds"));var comparison=worker.claim("adopted-and-standard-comparison");assertNotNull(comparison);worker.process(comparison);
        var body=fixture.reports.node(fixture.reports.version(comparison.version()).get("structured_report_json"));assertEquals(14,body.at("/sections/3/claims").size());assertTrue(body.path("limitations").toString().contains("既有体验记录"));unchanged();
        assertEquals(accepted.get("authorizationId"),service.adopt(closed.runId(),input(),operator,"replay-after-second-major").get("authorizationId"));
        db.update("DELETE FROM mp_run_product_adoption WHERE experience_run_id=?",run);
        assertError("PRODUCT_ADOPTION_ORDER_CONFLICT",()->service.adopt(closed.runId(),input(),operator,"no-retroactive-next-rewrite"));
    }

    @Test void releasedReviewStartsAndClosesAsStandardWithRealDecisionAndCannotDuplicateAnAdoption(){
        release();fixture.f.runs.localProductAccess(access);
        var standard=fixture.f.close(fixture.f.toReflection(fixture.f.toEvaluation(fixture.formal())));
        assertEquals("STANDARD",standard.runMode());assertEquals("PENDING",standard.reportStatus());
        var row=db.queryForMap("SELECT source_decision_id,source_recommendation_id FROM mp_experience_run WHERE public_id=?",standard.runId());assertNotNull(row.get("source_decision_id"));assertNotNull(row.get("source_recommendation_id"));
        assertEquals("REVIEW",db.queryForObject("SELECT status FROM mp_task_version WHERE public_id=?",String.class,fixture.fixtureId));
        var evidence=fixture.f.jobs.claim("released-standard-evidence");assertNotNull(evidence);fixture.f.jobs.process(evidence);
        var worker=fixture.worker(fixture.off());var generation=worker.claim("released-standard-report");assertNotNull(generation);worker.process(generation);
        assertEquals("READY",fixture.reports.version(generation.version()).get("status"));assertNull(fixture.reports.input(fixture.reports.version(generation.version())).sources().getFirst().pins().productAuthorization());
        assertError("MAJOR_ALREADY_STARTED",()->service.adopt(closed.runId(),input(),operator,"reject-duplicate-major"));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_run_product_adoption WHERE experience_run_id=?",Integer.class,run));unchanged();
    }

    @Test void wrongSnapshotHashOrTamperedSubmittedReflectionRollsBackAuthorizationAndNext(){
        release();var request=input();
        assertError("EVIDENCE_SOURCE_INVALID",()->service.adopt(closed.runId(),new ProductAdoptionService.Adopt(request.expectedRevision(),"0".repeat(64),request.evidenceSnapshotId(),REFERENCE,request.reasonText()),operator,"test"));
        assertError("EVIDENCE_SOURCE_INVALID",()->service.adopt(closed.runId(),new ProductAdoptionService.Adopt(request.expectedRevision(),closedSha,PublicIds.next(),REFERENCE,request.reasonText()),operator,"test"));
        String original=db.queryForObject("SELECT draft_json FROM mp_reflection WHERE experience_run_id=?",String.class,run);var bad=(ObjectNode)fixture.reports.node(original);bad.put("nextWorkStyle","BUSINESS_ACTION");
        try{db.update("UPDATE mp_reflection SET draft_json=? WHERE experience_run_id=?",bad.toString(),run);assertError("EVIDENCE_SOURCE_INVALID",()->service.adopt(closed.runId(),request,operator,"test"));}
        finally{db.update("UPDATE mp_reflection SET draft_json=? WHERE experience_run_id=?",original,run);}
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_run_product_adoption WHERE experience_run_id=?",Integer.class,run));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_report WHERE experience_run_id=?",Integer.class,run));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_recommendation WHERE source_run_id=?",Integer.class,run));unchanged();
    }

    PageEventService.Batch viewed(String runId){return new PageEventService.Batch(List.of(new PageEventService.Observation(key(),"experience.step.viewed","v1",Instant.now(),"EXPERIENCE_RUN",runId,1000L,mapper.createObjectNode().put("stepKey","a1-task"))));}
    PageEventService pages(){return new PageEventService(db,mapper,null,mock(RateLimits.class),new ProductEvents(db,mapper),false,false);}
    @Test void exactReleasedStandardReturns202ForStepObservationAndUnreleasedReviewRejects()throws Exception{
        var pages=pages();assertError("EVENT_BATCH_INVALID",()->tx.execute(status->pages.student(fixture.f.student,viewed(closed.runId()))));
        release();fixture.f.runs.localProductAccess(access);var standard=fixture.f.start(fixture.formal());
        var mvc=MockMvcBuilders.standaloneSetup(new PageEventController(pages,null)).setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).build();
        int status=tx.execute(txStatus->{try{return mvc.perform(post("/api/app/v1/events").requestAttr("mp.student",fixture.f.student).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsBytes(viewed(standard.runId())))).andReturn().getResponse().getStatus();}catch(Exception failure){throw new IllegalStateException(failure);}});
        assertEquals(202,status);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_product_event WHERE student_id=? AND event_name='experience.step.viewed' AND run_mode='STANDARD'",Integer.class,student()));
        db.update("DELETE FROM mp_local_task_release WHERE task_version_id IN (SELECT id FROM mp_task_version WHERE public_id=?)",fixture.fixtureId);
        assertError("EVENT_BATCH_INVALID",()->tx.execute(txStatus->pages.student(fixture.f.student,viewed(standard.runId()))));
    }

    @Test void adoptedHistoricalPageObservationRemainsPreviewWithPreviewFeatureDisabled(){
        adopt();var accepted=tx.execute(status->pages().student(fixture.f.student,viewed(closed.runId())));assertEquals(1,accepted.acceptedCount());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_product_event WHERE experience_run_id=? AND event_name='preview.experience.step.viewed' AND run_mode='REVIEW_PREVIEW'",Integer.class,run));unchanged();
    }

    @Test void withdrawingExactGrantAfterValidationFencesPublication(){
        adopt();var version=fixture.version(report());var input=fixture.reports.input(version);var catalog=fixture.core.compile(input);var proposal=fixture.core.defaultProposal(catalog,false);
        var hold=new ReportJobs(fixture.reports,fixture.core,fixture.coordinator,fixture.off()){@Override public boolean publish(Lease lease,ReportInput i,Catalog c,Proposal p,GenerationMode m){return false;}};fixture.workers.add(hold);
        var lease=hold.claim("validated-before-grant-removal");hold.process(lease);assertEquals("VALIDATED",fixture.reports.version(lease.version()).get("generation_phase"));
        db.update("DELETE FROM mp_run_product_adoption WHERE experience_run_id=? AND student_id=?",run,student());
        var normal=fixture.worker(fixture.off());assertError("REPORT_SOURCE_INVALID",()->normal.publish(lease,input,catalog,proposal,GenerationMode.DETERMINISTIC_FALLBACK));
        assertNull(fixture.reports.report(lease.report()).get("current_version_id"));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_report_claim WHERE report_version_id=?",Integer.class,lease.version()));unchanged();
    }

    @Test void corruptCrossOwnerAdoptionCannotAuthorizeOrApproveDeletion(){
        adopt();long otherProfile=db.queryForObject("SELECT id FROM mp_decision_profile WHERE student_id=?",Long.class,other.student.internalId());long originalProfile=db.queryForObject("SELECT decision_profile_id FROM mp_experience_run WHERE id=?",Long.class,run);
        try{db.update("UPDATE mp_run_product_adoption SET decision_profile_id=? WHERE experience_run_id=?",otherProfile,run);assertFalse(ProductEligibility.eligible(db,student(),run));assertError("REPORT_SOURCE_INVALID",()->fixture.reports.source(student(),snapshot,null));
            tx.executeWithoutResult(status->{db.update("UPDATE mp_student_account SET status='DELETION_PENDING' WHERE id=?",student());assertError("DELETION_SOURCE_INVALID",()->new AccountDeletionOwnershipGuard(db).validate(student()));status.setRollbackOnly();});
        }finally{db.update("UPDATE mp_run_product_adoption SET decision_profile_id=? WHERE experience_run_id=?",originalProfile,run);}
        assertTrue(ProductEligibility.eligible(db,student(),run));assertFalse(ProductEligibility.eligible(db,other.student.internalId(),run));
    }

    @Test void personalExportAndPhysicalDeletionIncludeOwnedAdoptionButKeepTaskRelease()throws Exception{
        adopt();var reportWorker=fixture.worker(fixture.off());reportWorker.process(reportWorker.claim("adoption-before-privacy"));
        byte[] archive=tx.execute(status->new PersonalExportWriter(db,mapper).build(student(),"FULL_PERSONAL_EXPORT",Instant.now()));JsonNode personal=null;
        try(var zip=new ZipInputStream(new ByteArrayInputStream(archive))){for(var entry=zip.getNextEntry();entry!=null;entry=zip.getNextEntry())if(entry.getName().equals("personal-data.json"))personal=mapper.readTree(zip.readAllBytes());}
        assertNotNull(personal);assertEquals("PROJECT_OWNER_REQUEST",personal.at("/runs/0/productAuthorization/authorityCode").asText());assertFalse(personal.toString().contains(REFERENCE));assertFalse(personal.toString().contains("authorized_by_operator_id"));
        var store=new PrivacyStore(db,tx,mapper);var files=new PrivateObjectStore(folder.toRealPath().toString());var passwords=new StudentPasswords();String password="synthetic-adoption-delete-77";db.update("UPDATE mp_student_account SET password_hash=? WHERE id=?",passwords.hash(password),student());
        var privacy=new PrivacyService(store,fixture.f.base.idem,mock(RateLimits.class),passwords,new StudentSessions(db),files);privacyJobs=new PrivacyJobs(store,files,new PersonalExportWriter(db,mapper),new AccountDeletionStages(store,files,new AccountDeletionOwnershipGuard(db)));
        var req=new MockHttpServletRequest();req.setAttribute("mp.student",fixture.f.student);var res=new MockHttpServletResponse();var response=(ResponseEntity<?>)new PrivacyController(privacy).deletion(Map.of(),key(),req,res);var issued=(PrivacyDtos.DeletionStatus)((Map<?,?>)response.getBody()).get("data");receipt=issued.receiptId();String cookie=res.getHeader("Set-Cookie");assertNotNull(cookie);String secret=cookie.substring("MP_DELETION=".length(),cookie.indexOf(';'));
        privacy.confirmDeletion(fixture.f.student,issued.requestId(),new PrivacyDtos.DeletionConfirm(password),key());var lease=privacyJobs.claim("adopted-private-delete");assertNotNull(lease);privacyJobs.process(lease);
        assertEquals("COMPLETED",privacy.receipt(receipt,secret).status());assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_run_product_adoption WHERE student_id=?",Integer.class,student()));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_student_account WHERE id=?",Integer.class,student()));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_local_task_release WHERE task_version_id IN (SELECT id FROM mp_task_version WHERE public_id=?)",Integer.class,fixture.fixtureId));assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_student_account WHERE id=?",Integer.class,other.student.internalId()));
    }
}
