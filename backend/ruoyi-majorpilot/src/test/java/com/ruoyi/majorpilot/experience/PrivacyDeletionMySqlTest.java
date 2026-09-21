package com.ruoyi.majorpilot.experience;

import com.ruoyi.majorpilot.auth.*;
import com.ruoyi.majorpilot.privacy.*;
import com.ruoyi.majorpilot.report.*;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.*;
import static com.ruoyi.majorpilot.experience.ExperienceMySqlTest.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Full graph: real task/evidence/report engines with separately marked TEST_FIXTURE content.
 * Private exports and deletion run normally. No production version is published by this test. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class PrivacyDeletionMySqlTest {
    @TempDir Path folder;
    ReportMySqlTest fixture;ExperienceMySqlTest other;PrivacyService privacy;PrivacyController controller;PrivacyJobs jobs;
    PrivateObjectStore files;String receiptId,receiptSecret,adminExportPublic;Long intakeId;List<String> artifactKeys=new ArrayList<>();
    static final String PASSWORD="synthetic-full-graph-password-73";
    @BeforeAll static void database(){ReportMySqlTest.database();assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='8' AND success=1",Integer.class));}
    @AfterAll static void contentCleanup(){ReportMySqlTest.contentCleanup();}
    @BeforeEach void setup()throws Exception{fixture=new ReportMySqlTest();fixture.setup();other=new ExperienceMySqlTest();other.fixture();files=new PrivateObjectStore(folder.toRealPath().toString());var store=new PrivacyStore(db,tx,mapper);var passwords=new StudentPasswords();db.update("UPDATE mp_student_account SET password_hash=?,analytics_exclusion_code='TEST' WHERE id=?",passwords.hash(PASSWORD),student());var guard=new AccountDeletionOwnershipGuard(db);var stages=new AccountDeletionStages(store,files,guard);jobs=new PrivacyJobs(store,files,new PersonalExportWriter(db,mapper),stages);privacy=new PrivacyService(store,fixture.f.base.idem,mock(RateLimits.class),passwords,new StudentSessions(db),files);controller=new PrivacyController(privacy);}
    long student(){return fixture.f.student.internalId();}
    @AfterEach void cleanup(){
        if(jobs!=null)jobs.stop();if(fixture==null)return;long student=student();
        // Exact fixture cleanup is independent of the deletion implementation under test.
        if(adminExportPublic!=null){var ids=db.queryForList("SELECT id FROM mp_admin_export WHERE public_id=?",Long.class,adminExportPublic);for(long id:ids){db.update("DELETE FROM mp_idempotency_record WHERE resource_type='ADMIN_EXPORT' AND resource_id=?",id);db.update("DELETE FROM mp_background_job WHERE job_type='ADMIN_EXPORT' AND target_type='ADMIN_EXPORT' AND target_id=?",id);db.update("DELETE FROM mp_admin_export_student WHERE export_id=?",id);db.update("DELETE FROM mp_sensitive_audit WHERE target_type='ADMIN_EXPORT' AND target_public_id=?",adminExportPublic);db.update("DELETE FROM mp_admin_export WHERE id=?",id);}}
        db.update("DELETE FROM mp_student_data_export WHERE student_id=?",student);db.update("DELETE FROM mp_account_deletion_request WHERE student_id=?",student);if(receiptId!=null)db.update("DELETE FROM mp_account_deletion_request WHERE receipt_id=?",receiptId);db.update("DELETE FROM mp_student_session WHERE student_id=?",student);db.update("DELETE FROM mp_email_token WHERE student_id=?",student);db.update("DELETE FROM mp_security_event WHERE student_id=?",student);db.update("DELETE FROM mp_sensitive_audit WHERE owner_student_id=?",student);db.update("UPDATE mp_decision_profile SET supersedes_profile_id=NULL WHERE student_id=?",student);
        if(intakeId!=null){db.update("DELETE FROM mp_product_event WHERE intake_session_id=?",intakeId);db.update("DELETE FROM mp_idempotency_record WHERE owner_intake_session_id=?",intakeId);db.update("DELETE FROM mp_consent_record WHERE intake_session_id=?",intakeId);db.update("UPDATE mp_decision_profile SET intake_session_id=NULL WHERE intake_session_id=?",intakeId);db.update("DELETE FROM mp_intake_session WHERE id=?",intakeId);}db.update("DELETE FROM mp_consent_record WHERE student_id=?",student);
        fixture.cleanup();if(other!=null)other.cleanup();for(String key:artifactKeys)files.delete(key);
    }
    MockHttpServletRequest request(){var req=new MockHttpServletRequest();req.setAttribute("mp.student",fixture.f.student);return req;}
    PrivacyDtos.DeletionStatus deletionRequest(){var res=new MockHttpServletResponse();var response=(ResponseEntity<?>)controller.deletion(Map.of(),key(),request(),res);var data=(PrivacyDtos.DeletionStatus)((Map<?,?>)response.getBody()).get("data");receiptId=data.receiptId();String cookie=res.getHeader("Set-Cookie");assertNotNull(cookie);receiptSecret=cookie.substring("MP_DELETION=".length(),cookie.indexOf(';'));return data;}
    record Captured(String table,List<Long> ids){}
    Captured capture(String table,String select,Object... parameters){return new Captured(table,db.queryForList(select,Long.class,parameters));}
    List<Captured> captureOwnedRows(){
        var rows=new ArrayList<Captured>();
        for(String table:List.of("mp_student_account","mp_decision_profile","mp_recommendation","mp_recommendation_decision","mp_experience_run","mp_report","mp_evidence_snapshot","mp_student_feedback","mp_ai_call","mp_student_session","mp_email_token","mp_security_event","mp_student_data_export"))rows.add(capture(table,"SELECT id FROM "+table+" WHERE "+(table.equals("mp_student_account")?"id":"student_id")+"=?",student()));
        rows.add(capture("mp_intake_session","SELECT id FROM mp_intake_session WHERE claimed_student_id=?",student()));
        for(String table:List.of("mp_consent_record","mp_product_event"))rows.add(capture(table,"SELECT x.id FROM "+table+" x LEFT JOIN mp_intake_session i ON i.id=x.intake_session_id WHERE x.student_id=? OR i.claimed_student_id=?",student(),student()));
        rows.add(capture("mp_idempotency_record","SELECT x.id FROM mp_idempotency_record x LEFT JOIN mp_intake_session i ON i.id=x.owner_intake_session_id WHERE x.owner_student_id=? OR i.claimed_student_id=?",student(),student()));
        rows.add(capture("mp_background_job","SELECT id FROM mp_background_job WHERE owner_student_id=?",student()));
        rows.add(capture("mp_sensitive_audit","SELECT id FROM mp_sensitive_audit WHERE owner_student_id=?",student()));
        rows.add(capture("mp_decision_answer","SELECT a.id FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id WHERE p.student_id=?",student()));
        rows.add(capture("mp_recommendation_reason","SELECT a.id FROM mp_recommendation_reason a JOIN mp_recommendation p ON p.id=a.recommendation_id WHERE p.student_id=?",student()));
        for(String table:List.of("mp_step_state","mp_execution_record","mp_hint_request","mp_reflection","mp_run_closure_request"))rows.add(capture(table,"SELECT x.id FROM "+table+" x JOIN mp_experience_run r ON r.id=x.experience_run_id WHERE r.student_id=?",student()));
        for(String table:List.of("mp_step_response_revision","mp_step_completion"))rows.add(capture(table,"SELECT x.id FROM "+table+" x JOIN mp_step_state s ON s.id=x.step_state_id JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",student()));
        rows.add(capture("mp_reflection_answer","SELECT x.id FROM mp_reflection_answer x JOIN mp_reflection f ON f.id=x.reflection_id JOIN mp_experience_run r ON r.id=f.experience_run_id WHERE r.student_id=?",student()));
        rows.add(capture("mp_evidence_item","SELECT x.id FROM mp_evidence_item x JOIN mp_evidence_snapshot e ON e.id=x.evidence_snapshot_id WHERE e.student_id=?",student()));
        rows.add(capture("mp_report_version","SELECT x.id FROM mp_report_version x JOIN mp_report r ON r.id=x.report_id WHERE r.student_id=?",student()));
        rows.add(capture("mp_report_claim","SELECT x.id FROM mp_report_claim x JOIN mp_report_version v ON v.id=x.report_version_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student()));
        return rows;
    }
    void supplementaryOwnedData()throws Exception{
        long p=db.queryForObject("SELECT id FROM mp_decision_profile WHERE student_id=?",Long.class,student());String intake=PublicIds.next();db.update("INSERT INTO mp_intake_session(public_id,secret_hash,questionnaire_version,status,draft_json,expires_at,claimed_student_id,claimed_at) VALUES(?,?,'decision-profile-v1','CLAIMED','{}',UTC_TIMESTAMP(3)+INTERVAL 1 DAY,?,UTC_TIMESTAMP(3))",intake,Secrets.hash(intake),student());intakeId=db.queryForObject("SELECT id FROM mp_intake_session WHERE public_id=?",Long.class,intake);db.update("UPDATE mp_decision_profile SET intake_session_id=? WHERE id=?",intakeId,p);
        db.update("INSERT INTO mp_decision_profile(public_id,student_id,profile_version_no,questionnaire_version,submitted_at,profile_summary_json,supersedes_profile_id) VALUES(?,?,2,'decision-profile-v1',UTC_TIMESTAMP(3),'{}',?)",PublicIds.next(),student(),p);
        db.update("INSERT INTO mp_decision_answer(decision_profile_id,question_key,answer_json,schema_version) VALUES(?,'currentFieldText','\"synthetic own answer\"','decision-profile-v1')",p);
        db.update("INSERT INTO mp_consent_record(intake_session_id,document_type,document_version,decision) VALUES(?,'PRIVACY','privacy-v1','ACCEPTED')",intakeId);db.update("INSERT INTO mp_consent_record(student_id,document_type,document_version,decision) VALUES(?,'RESEARCH','research-v1','WITHDRAWN')",student());
        db.update("INSERT INTO mp_product_event(event_id,event_name,event_version,source,occurred_at,intake_session_id,properties_json) VALUES(?,'synthetic.intake','v1','CLIENT',UTC_TIMESTAMP(3),?,'{}')",PublicIds.next(),intakeId);
        db.update("INSERT INTO mp_idempotency_record(owner_intake_session_id,scope_hash,key_hash,request_hmac,status,expires_at) VALUES(?,?,?,?,'COMPLETED',UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",intakeId,Secrets.hash(PublicIds.next()),Secrets.hash(PublicIds.next()),"0".repeat(64));
        new StudentSessions(db).issue(student());db.update("INSERT INTO mp_email_token(student_id,purpose,token_hash,expires_at) VALUES(?,'VERIFY_EMAIL',?,UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",student(),Secrets.hash(PublicIds.next()));db.update("INSERT INTO mp_security_event(public_id,student_id,event_code,request_id) VALUES(?,?,'SYNTHETIC_TEST','privacy-deletion')",PublicIds.next(),student());
    }
    void sharedAdminFile(){
        long operator=db.queryForObject("SELECT MIN(user_id) FROM sys_user",Long.class);adminExportPublic=PublicIds.next();String artifact="admin/"+PublicIds.next()+".csv";artifactKeys.add(artifact);var stored=files.write(artifact,"synthetic private csv".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        db.update("INSERT INTO mp_admin_export(public_id,operator_id,dataset,filters_json,fields_json,purpose,status,object_key,file_sha256,file_size_bytes,row_count,completed_at,expires_at) VALUES(?,?,'STUDENTS','{}','[]','synthetic full deletion membership','READY',?,?,?,2,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",adminExportPublic,operator,artifact,stored.sha256(),stored.size());long export=db.queryForObject("SELECT id FROM mp_admin_export WHERE public_id=?",Long.class,adminExportPublic);
        db.update("INSERT INTO mp_admin_export_student(export_id,student_id) VALUES(?,?),(?,?)",export,student(),export,other.student.internalId());db.update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_operator_id,target_type,target_id,status,checkpoint_json) VALUES(?,'ADMIN_EXPORT',?,?,'ADMIN_EXPORT',?,'SUCCEEDED',?)",PublicIds.next(),"admin-export:"+adminExportPublic,operator,export,"{\"artifactKeys\":[\""+artifact+"\"]}");
        db.update("INSERT INTO mp_idempotency_record(scope_hash,key_hash,request_hmac,status,resource_type,resource_id,safe_response_json,expires_at) VALUES(?,?,?,'COMPLETED','ADMIN_EXPORT',?,'{}',UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",Secrets.hash(PublicIds.next()),Secrets.hash(PublicIds.next()),"0".repeat(64),export);
    }
    @Test void deletesCompleteRealGraphAndRecoveryHistoryButPreservesOtherStudentAndSharedContent()throws Exception{
        var report=fixture.prepared();var reportWorker=fixture.worker(fixture.off());var ai=reportWorker.claim("full-graph-ai");reportWorker.process(ai);fixture.prepareAdditional("DATA_SCIENCE");reportWorker.process(reportWorker.claim("full-graph-ds"));reportWorker.process(reportWorker.claim("full-graph-comparison"));
        String version=(String)fixture.reports.version(ai.version()).get("public_id");new FeedbackService(fixture.reports,fixture.f.base.idem,mock(RateLimits.class)).submit(fixture.f.student,key(),new ReportDtos.Feedback("REPORT","REPORT_VERSION",version,5,"synthetic complete own feedback","report-value-v1",mapper.createObjectNode().put("insightResponse",5),null));
        var base=fixture.f.base;var demo=base.start(base.create("DEMO_TABLE"));base.save(demo,"prepare","{}");base.save(demo,"prepare","{\"acknowledged\":true}");base.hints.hint(base.student,demo.runId(),key(),new RunDtos.Hint("prepare",1));demo=base.current(demo);base.runs.recover(1,demo.runId(),key(),new RunDtos.Recovery(demo.revision(),"TECHNICAL_FAILURE","Synthetic full deletion recovery history"),"deletion-test");fixture.f.preview();
        supplementaryOwnedData();var preservedRun=other.start(other.create("DEMO_TABLE"));other.save(preservedRun,"prepare","{\"acknowledged\":true}");String preservedEmail=db.queryForObject("SELECT email_display FROM mp_student_account WHERE id=?",String.class,other.student.internalId());long sharedTasks=db.queryForObject("SELECT COUNT(*) FROM mp_task_version",Long.class);
        var requested=privacy.requestExport(fixture.f.student,new PrivacyDtos.ExportRequest("FULL_PERSONAL_EXPORT"),key());var exportLease=jobs.claim("full-graph-export");assertNotNull(exportLease);jobs.process(exportLease);assertEquals("READY",privacy.exportStatus(fixture.f.student,requested.exportId()).status());String personalKey=db.queryForObject("SELECT object_key FROM mp_student_data_export WHERE public_id=?",String.class,requested.exportId());artifactKeys.add(personalKey);sharedAdminFile();
        var captured=captureOwnedRows();for(String required:List.of("mp_decision_answer","mp_hint_request","mp_ai_call","mp_report_claim","mp_report_version","mp_evidence_item","mp_step_completion","mp_student_feedback","mp_run_closure_request"))assertFalse(captured.stream().filter(x->x.table.equals(required)).findFirst().orElseThrow().ids.isEmpty(),required);
        var sourceVersions=db.queryForList("SELECT comparison_report_version_id FROM mp_comparison_source WHERE comparison_report_version_id IN (SELECT v.id FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?)",Long.class,student());assertFalse(sourceVersions.isEmpty());
        var issued=deletionRequest();privacy.confirmDeletion(fixture.f.student,issued.requestId(),new PrivacyDtos.DeletionConfirm(PASSWORD),key());var lease=jobs.claim("full-graph-delete");assertNotNull(lease);assertEquals("ACCOUNT_DELETE",lease.type());jobs.process(lease);
        assertEquals("COMPLETED",privacy.receipt(receiptId,receiptSecret).status());for(var record:captured)for(long id:record.ids)assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM "+record.table+" WHERE id=?",Integer.class,id),record.table);
        for(long source:sourceVersions)assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_comparison_source WHERE comparison_report_version_id=?",Integer.class,source));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_admin_export WHERE public_id=?",Integer.class,adminExportPublic));for(String key:artifactKeys)assertThrows(IllegalStateException.class,()->files.read(key));
        assertEquals(preservedEmail,db.queryForObject("SELECT email_display FROM mp_student_account WHERE id=?",String.class,other.student.internalId()));assertEquals(preservedRun.runId(),other.current(preservedRun).runId());assertTrue(other.runs.step(other.student,preservedRun.runId(),"prepare").response().path("acknowledged").asBoolean());assertEquals(sharedTasks,db.queryForObject("SELECT COUNT(*) FROM mp_task_version",Long.class));
        var receipt=db.queryForMap("SELECT student_id,status,current_stage,failure_code,last_attempt_at,receipt_expires_at,completed_at FROM mp_account_deletion_request WHERE receipt_id=?",receiptId);assertNull(receipt.get("student_id"));assertNull(receipt.get("failure_code"));assertNull(receipt.get("last_attempt_at"));assertEquals("COMPLETED",receipt.get("current_stage"));assertTrue(DbTimes.instant(receipt.get("receipt_expires_at")).isAfter(Instant.now()));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE owner_student_id=?",Integer.class,student()));
    }
}
