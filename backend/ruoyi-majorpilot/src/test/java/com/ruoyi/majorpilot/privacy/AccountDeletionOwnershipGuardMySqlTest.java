package com.ruoyi.majorpilot.privacy;

import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import java.util.function.Consumer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Every fixture is rolled back. Does not create schema, disable FKs or publish Task Versions. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class AccountDeletionOwnershipGuardMySqlTest {
    static JdbcTemplate db;static TransactionTemplate tx;
    @BeforeAll static void database(){
        String url=System.getenv("MP_DB_URL");if(url==null||!url.startsWith("jdbc:mysql://127.0.0.1:13306/majorpilot?"))throw new IllegalStateException("Dedicated test database required");
        var source=new DriverManagerDataSource(url.replace("/majorpilot?","/majorpilot_test?"),System.getenv("MP_DB_USERNAME"),System.getenv("MP_DB_PASSWORD"));db=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='8' AND success=1",Integer.class),"V8 must be applied by the authorized integration runner");
    }
    record Subjects(long first,long second){}
    void fixture(Consumer<Subjects> body){tx.executeWithoutResult(t->{t.setRollbackOnly();body.accept(new Subjects(student(),student()));});}
    long student(){String id=PublicIds.next();db.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,status,analytics_exclusion_code) VALUES(?,?,?,'DELETION_PENDING','TEST')",id,"p7-guard-"+id+"@example.invalid","p7-guard-"+id+"@example.invalid");return id("mp_student_account",id);}
    long id(String table,String publicId){return db.queryForObject("SELECT id FROM "+table+" WHERE public_id=?",Long.class,publicId);}
    String publicId(String table,long id){return db.queryForObject("SELECT public_id FROM "+table+" WHERE id=?",String.class,id);}
    void valid(long student){assertDoesNotThrow(()->new AccountDeletionOwnershipGuard(db).validate(student));}
    void invalid(long student){var error=assertThrows(ApiException.class,()->new AccountDeletionOwnershipGuard(db).validate(student));assertEquals(503,error.status);assertEquals("DELETION_SOURCE_INVALID",error.code);}
    long intake(long owner){String publicId=PublicIds.next();db.update("INSERT INTO mp_intake_session(public_id,secret_hash,questionnaire_version,status,draft_json,expires_at,claimed_student_id,claimed_at) VALUES(?,?,'guard-v1','CLAIMED','{}',UTC_TIMESTAMP(3)+INTERVAL 1 DAY,?,UTC_TIMESTAMP(3))",publicId,Secrets.hash(publicId),owner);return id("mp_intake_session",publicId);}
    long profile(Long owner,Long intake,int version){String publicId=PublicIds.next();db.update("INSERT INTO mp_decision_profile(public_id,student_id,intake_session_id,profile_version_no,questionnaire_version,submitted_at,profile_summary_json) VALUES(?,?,?,?,'guard-v1',UTC_TIMESTAMP(3),'{}')",publicId,owner,intake,version);return id("mp_decision_profile",publicId);}
    long recommendation(Long owner,long profile){String publicId=PublicIds.next();db.update("INSERT INTO mp_recommendation(public_id,student_id,decision_profile_id,recommendation_type,completed_major_codes_json,rule_version,primary_major_code,alternative_order_json,tie_detected,explanation_status,explanation_version,safe_result_json,generated_at) VALUES(?,?,?,'INITIAL','[]','guard-v1','AI','[]',false,'STRUCTURED_ONLY','guard-v1','{}',UTC_TIMESTAMP(3))",publicId,owner,profile);return id("mp_recommendation",publicId);}
    long run(long owner){String publicId=PublicIds.next();db.update("INSERT INTO mp_experience_run(public_id,student_id,content_kind,demo_key,status) VALUES(?,?,'DEMO',?,'READY')",publicId,owner,"GUARD_"+publicId);return id("mp_experience_run",publicId);}
    long report(long owner){String publicId=PublicIds.next();db.update("INSERT INTO mp_report(public_id,student_id,report_type) VALUES(?,?,'COMPARISON')",publicId,owner);return id("mp_report",publicId);}
    long version(long report){String publicId=PublicIds.next();db.update("INSERT INTO mp_report_version(public_id,report_id,version_no,request_manifest_json,request_manifest_sha256,template_version,prompt_version,schema_version,claim_rule_version) VALUES(?,?,1,'{}',?,'guard-v1','guard-v1','guard-v1','guard-v1')",publicId,report,"0".repeat(64));return id("mp_report_version",publicId);}

    @Test void claimedAnonymousBranchesAreOwnedWithoutRequiringDuplicatedStudentColumns(){fixture(s->{
        long i=intake(s.first),p=profile(null,i,1);recommendation(null,p);
        db.update("INSERT INTO mp_consent_record(intake_session_id,document_type,document_version,decision) VALUES(?,'PRIVACY','guard-v1','ACCEPTED')",i);
        db.update("INSERT INTO mp_product_event(event_id,event_name,event_version,source,occurred_at,intake_session_id,properties_json) VALUES(?,'guard.synthetic','guard-v1','CLIENT',UTC_TIMESTAMP(3),?,'{}')",PublicIds.next(),i);
        db.update("INSERT INTO mp_idempotency_record(owner_intake_session_id,scope_hash,key_hash,request_hmac,status,expires_at) VALUES(?,?,?,?,'COMPLETED',UTC_TIMESTAMP(3)+INTERVAL 1 DAY)",i,Secrets.hash(PublicIds.next()),Secrets.hash(PublicIds.next()),"0".repeat(64));
        valid(s.first);valid(s.second);
        assertEquals(s.first,db.queryForObject("SELECT deletion_owner FROM ("+AccountDeletionOwnershipGuard.projection("mp_decision_profile")+") owned WHERE id=?",Long.class,p));
    });}
    @Test void conflictingDirectAndClaimedOwnersRejectInBothDirectionsAndNeverDelete(){fixture(s->{long i=intake(s.first);db.update("INSERT INTO mp_consent_record(student_id,intake_session_id,document_type,document_version,decision) VALUES(?,?,'PRIVACY','guard-v1','ACCEPTED')",s.second,i);invalid(s.first);invalid(s.second);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_consent_record WHERE student_id=? AND intake_session_id=?",Integer.class,s.second,i));assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM mp_student_account WHERE id IN (?,?)",Integer.class,s.first,s.second));});}
    @Test void recommendationCannotHideAnotherSubjectsProfileBehindItsOwnStudentColumn(){fixture(s->{long p=profile(s.first,null,1);recommendation(s.second,p);invalid(s.first);invalid(s.second);});}
    @Test void profileCyclesAndRunRecoveryCyclesRejectButAcyclicChainsPass(){fixture(s->{
        long p=profile(s.first,null,1),later=profile(s.first,null,2);db.update("UPDATE mp_decision_profile SET supersedes_profile_id=? WHERE id=?",p,later);valid(s.first);db.update("UPDATE mp_decision_profile SET supersedes_profile_id=? WHERE id=?",later,p);invalid(s.first);db.update("UPDATE mp_decision_profile SET supersedes_profile_id=NULL WHERE id=?",p);
        long first=run(s.first),next=run(s.first);db.update("UPDATE mp_experience_run SET created_reason='OPERATOR_RECOVERY',attempt_no=2,origin_run_id=? WHERE id=?",first,next);valid(s.first);db.update("UPDATE mp_experience_run SET created_reason='OPERATOR_RECOVERY',attempt_no=3,origin_run_id=? WHERE id=?",next,first);invalid(s.first);
    });}
    @Test void reportVersionPointersAndComparisonSourcesRejectCrossOwnerIncomingEdges(){fixture(s->{
        long a=report(s.first),b=report(s.second),av=version(a),bv=version(b);valid(s.first);valid(s.second);
        db.update("UPDATE mp_report SET current_version_id=? WHERE id=?",bv,a);invalid(s.first);invalid(s.second);db.update("UPDATE mp_report SET current_version_id=NULL WHERE id=?",a);
        db.update("INSERT INTO mp_comparison_source(comparison_report_version_id,source_experience_report_version_id,major_id) VALUES(?,?,(SELECT id FROM mp_major WHERE code='AI'))",av,bv);invalid(s.first);invalid(s.second);
    });}
    @Test void executionApplicationBridgeAndUnconstrainedJobTargetCannotCrossSubjects(){fixture(s->{
        long a=run(s.first),b=run(s.second);String e=PublicIds.next();db.update("INSERT INTO mp_step_state(experience_run_id,step_key) VALUES(?,'guard-step')",a);long step=db.queryForObject("SELECT id FROM mp_step_state WHERE experience_run_id=?",Long.class,a);
        db.update("INSERT INTO mp_step_response_revision(step_state_id,revision_no,response_schema_version,response_json,content_sha256) VALUES(?,1,'guard-v1','{}',?)",step,"0".repeat(64));long revision=db.queryForObject("SELECT id FROM mp_step_response_revision WHERE step_state_id=?",Long.class,step);
        db.update("INSERT INTO mp_execution_record(public_id,request_public_id,experience_run_id,step_key,engine_type,engine_version,operation_key,input_revision,trust_level,input_sha256,status,duration_ms) VALUES(?,?,?,'guard-step','DEMO','guard-v1','guard-op',1,'SERVER_VERIFIED',?,'FAILED',0)",e,e,b,"0".repeat(64));long execution=id("mp_execution_record",e);
        db.update("INSERT INTO mp_response_execution(response_revision_id,execution_record_id,source_binding_sha256,source_revisions_json) VALUES(?,?,?,'{}')",revision,execution,"0".repeat(64));invalid(s.first);invalid(s.second);db.update("DELETE FROM mp_response_execution WHERE response_revision_id=? AND execution_record_id=?",revision,execution);
        db.update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_student_id,target_type,target_id) VALUES(?,'EVIDENCE_BUILD',?,?,'EXPERIENCE_RUN',?)",PublicIds.next(),"guard:"+PublicIds.next(),s.second,a);invalid(s.first);invalid(s.second);
    });}
    @Test void legacyAuditIsDerivedOnlyFromKnownTargetAndExplicitMismatchStopsDeletion(){fixture(s->{
        long run=run(s.first);String audit=PublicIds.next();db.update("INSERT INTO mp_sensitive_audit(public_id,operator_id,action_code,target_type,target_public_id,reason_code,reason_text,before_summary_json,after_summary_json,correlation_id) VALUES(?,1,'GUARD_TEST','EXPERIENCE_RUN',?,'TEST','synthetic test','{}','{}','guard')",audit,publicId("mp_experience_run",run));valid(s.first);
        assertEquals(s.first,db.queryForObject("SELECT deletion_owner FROM ("+AccountDeletionOwnershipGuard.projection("mp_sensitive_audit")+") owned WHERE public_id=?",Long.class,audit));
        db.update("UPDATE mp_sensitive_audit SET owner_student_id=? WHERE public_id=?",s.second,audit);invalid(s.first);invalid(s.second);
    });}
    @Test void historicalEvidenceMayHaveMissingProvenanceButResolvedForeignSourceIsRejected(){fixture(s->{
        long a=run(s.first),b=run(s.second),p=profile(s.first,null,1);String task=PublicIds.next();db.update("INSERT INTO mp_task_version(public_id,content_kind,demo_key,version_code,manifest_path,manifest_sha256,data_sha256,content_schema_version,manifest_json) VALUES(?,'DEMO',?,'guard-v1','guard/manifest.json',?,?,'guard-v1','{}')",task,"GUARD_"+task,"0".repeat(64),"0".repeat(64));long taskId=id("mp_task_version",task);
        String snapshot=PublicIds.next();db.update("INSERT INTO mp_evidence_snapshot(public_id,student_id,experience_run_id,snapshot_version_no,run_mode,decision_profile_id,task_version_id,closed_input_sha256,evidence_rule_version,status) VALUES(?,?,?,1,'STANDARD',?,?,?,'guard-v1','FAILED')",snapshot,s.first,a,p,taskId,"0".repeat(64));long snap=id("mp_evidence_snapshot",snapshot);String evidence=PublicIds.next();
        db.update("INSERT INTO mp_evidence_item(public_id,evidence_snapshot_id,evidence_key,evidence_type,source_type,source_id,structured_value_json,display_summary,allowed_claim_types_json,sensitivity_class,observed_at,rule_version) VALUES(?,?,'guard-historical','ASSISTANCE_CONTEXT','HINT_REQUEST',0,'{}','synthetic historical source','[]','INTERNAL',UTC_TIMESTAMP(3),'guard-v1')",evidence,snap);valid(s.first);
        String hint=PublicIds.next();db.update("INSERT INTO mp_hint_request(public_id,experience_run_id,step_key,hint_level,input_revision,request_context_json,status) VALUES(?,?,'guard-step',1,0,'{}','FAILED')",hint,b);db.update("UPDATE mp_evidence_item SET source_id=? WHERE public_id=?",id("mp_hint_request",hint),evidence);invalid(s.first);invalid(s.second);
    });}
    @Test void sharedAdminExportMembershipIsAllowedButItsOperatorJobMustMatch(){fixture(s->{
        Long operator=db.queryForObject("SELECT MIN(user_id) FROM sys_user",Long.class);assertNotNull(operator);String export=PublicIds.next();db.update("INSERT INTO mp_admin_export(public_id,operator_id,dataset,filters_json,fields_json,purpose) VALUES(?,?,'STUDENTS','{}','[]','synthetic guard export')",export,operator);long id=id("mp_admin_export",export);
        db.update("INSERT INTO mp_admin_export_student(export_id,student_id) VALUES(?,?),(?,?)",id,s.first,id,s.second);valid(s.first);valid(s.second);
        String job=PublicIds.next();db.update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_operator_id,target_type,target_id) VALUES(?,'ADMIN_EXPORT',?,?,'ADMIN_EXPORT',?)",job,"guard:"+job,operator,id);valid(s.first);
        // A Student-owned job masquerading as an Operator export passes the owner CHECK for its
        // declared type, but must not get deletion authority over the shared artifact.
        db.update("UPDATE mp_background_job SET job_type='EVIDENCE_BUILD',owner_operator_id=NULL,owner_student_id=? WHERE public_id=?",s.second,job);invalid(s.first);invalid(s.second);
    });}
}
