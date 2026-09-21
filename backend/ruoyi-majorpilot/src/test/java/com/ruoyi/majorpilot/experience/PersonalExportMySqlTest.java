package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.privacy.PersonalExportWriter;
import com.ruoyi.majorpilot.report.ReportStore;
import com.ruoyi.majorpilot.shared.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static com.ruoyi.majorpilot.experience.ExperienceMySqlTest.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real private ZIP projection over synthetic Students and normal task/report engines. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class PersonalExportMySqlTest {
    ReportMySqlTest f;PersonalExportWriter writer;Long other;
    @BeforeAll static void database(){ReportMySqlTest.database();}
    @AfterAll static void contentCleanup(){ReportMySqlTest.contentCleanup();}
    @BeforeEach void setup()throws Exception{f=new ReportMySqlTest();f.setup();writer=new PersonalExportWriter(db,mapper);}
    @AfterEach void cleanup(){if(other!=null){db.update("DELETE FROM mp_student_feedback WHERE student_id=?",other);db.update("DELETE FROM mp_student_account WHERE id=?",other);}db.update("DELETE FROM mp_consent_record WHERE student_id=?",f.f.student.internalId());db.update("DELETE FROM mp_intake_session WHERE claimed_student_id=?",f.f.student.internalId());f.cleanup();}
    byte[] build(String scope){return tx.execute(t->{db.queryForMap("SELECT id FROM mp_student_account WHERE id=? FOR UPDATE",f.f.student.internalId());return writer.build(f.f.student.internalId(),scope,Instant.now());});}
    static Map<String,byte[]> unzip(byte[] bytes)throws Exception{var out=new LinkedHashMap<String,byte[]>();try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes),StandardCharsets.UTF_8)){for(var e=zip.getNextEntry();e!=null;e=zip.getNextEntry())assertNull(out.put(e.getName(),zip.readAllBytes()));}return out;}
    long other(){String id=PublicIds.next();db.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash,status) VALUES(?,?,?,'OTHER_SECRET_HASH','ACTIVE')",id,"other-export-"+id+"@example.invalid","FOREIGN_EMAIL_MUST_NOT_APPEAR");other=db.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,id);return other;}
    @Test void allPublishedVersionsButNoCandidatesOtherStudentOrCredentialFields()throws Exception{
        var report=f.prepared();var worker=f.worker(f.off());var first=worker.claim("export-v1");worker.process(first);var ready=f.reports.report(first.report());f.service.regenerate(1,(String)report.get("public_id"),key(),f.reuse(ready),"export-test");var second=worker.claim("export-v2");worker.process(second);ready=f.reports.report(first.report());var pending=f.service.regenerate(1,(String)report.get("public_id"),key(),f.reuse(ready),"export-pending");
        long profile=db.queryForObject("SELECT id FROM mp_decision_profile WHERE student_id=?",Long.class,f.f.student.internalId());String answer="<script>这是我的完整回答，不应被删除或截短。</script>";db.update("INSERT INTO mp_decision_answer(decision_profile_id,question_key,answer_json,schema_version) VALUES(?,'currentFieldText',?,'decision-profile-v1')",profile,mapper.writeValueAsString(answer));db.update("INSERT INTO mp_consent_record(student_id,document_type,document_version,decision) VALUES(?,'RESEARCH','research-v1','WITHDRAWN')",f.f.student.internalId());
        db.update("INSERT INTO mp_student_feedback(public_id,student_id,feedback_type,comment_text) VALUES(?,?,'GENERAL','MY_COMPLETE_FEEDBACK')",PublicIds.next(),f.f.student.internalId());db.update("INSERT INTO mp_student_feedback(public_id,student_id,feedback_type,comment_text) VALUES(?,?,'GENERAL','FOREIGN_COMMENT_MUST_NOT_APPEAR')",PublicIds.next(),other());db.update("UPDATE mp_student_account SET password_hash='OWN_SECRET_HASH',analytics_exclusion_code='TEST' WHERE id=?",f.f.student.internalId());
        var files=unzip(build("FULL_PERSONAL_EXPORT"));var manifest=mapper.readTree(files.get("manifest.json"));var data=mapper.readTree(files.get("personal-data.json"));assertEquals(4,files.size());assertEquals(3,manifest.path("files").size());assertFalse(files.containsKey("reports/"+pending.reportVersionId()+".html"));assertEquals(Set.of("READY","SUPERSEDED"),new HashSet<>(java.util.stream.StreamSupport.stream(manifest.path("files").spliterator(),false).filter(x->x.has("publicationStatus")).map(x->x.path("publicationStatus").asText()).toList()));assertEquals(answer,data.path("profiles").get(0).path("answers").get(0).path("answer").asText());assertEquals("WITHDRAWN",data.path("consents").get(0).path("decision").asText());assertEquals("MY_COMPLETE_FEEDBACK",data.path("feedback").get(0).path("comment").asText());assertTrue(data.path("runs").get(0).path("executions").get(0).path("result").isObject());assertEquals(2,data.path("recommendations").size());
        String everything=new String(files.get("personal-data.json"),StandardCharsets.UTF_8);for(String excluded:List.of("FOREIGN_","OWN_SECRET_HASH","password_hash","analytics_exclusion_code","request_hmac","token_hash","claim_catalog_sha256","input_manifest_json","privatePrompt","evaluation-private"))assertFalse(everything.contains(excluded),excluded);
        var reportsOnly=unzip(build("REPORTS_ONLY"));assertEquals(3,reportsOnly.size());assertFalse(reportsOnly.containsKey("personal-data.json"));assertEquals(2,mapper.readTree(reportsOnly.get("manifest.json")).path("files").size());
    }
    @Test void allRunModesReplacedAttemptsAndEveryResponseRevisionRemainReadable()throws Exception{
        var base=f.f.base;var original=base.start(base.create("DEMO_TABLE"));base.save(original,"prepare","{}");base.save(original,"prepare","{\"acknowledged\":true}");var demo=base.current(original);var recovered=base.runs.recover(1,demo.runId(),key(),new RunDtos.Recovery(demo.revision(),"TECHNICAL_FAILURE","Synthetic personal export recovery test"),"export-recovery");var preview=f.f.preview();
        var data=mapper.readTree(unzip(build("FULL_PERSONAL_EXPORT")).get("personal-data.json"));var runs=data.path("runs");assertEquals(3,runs.size());var old=java.util.stream.StreamSupport.stream(runs.spliterator(),false).filter(x->x.path("runId").asText().equals(demo.runId())).findFirst().orElseThrow();assertEquals("REPLACED",old.path("status").asText());assertEquals(2,old.path("steps").get(0).path("revisions").size());assertTrue(old.path("steps").get(0).path("revisions").get(0).path("response").isEmpty());assertTrue(old.path("steps").get(0).path("revisions").get(1).path("response").path("acknowledged").booleanValue());assertTrue(java.util.stream.StreamSupport.stream(runs.spliterator(),false).anyMatch(x->x.path("runId").asText().equals(preview.runId())&&x.path("runMode").asText().equals("REVIEW_PREVIEW")));assertTrue(java.util.stream.StreamSupport.stream(runs.spliterator(),false).anyMatch(x->x.path("runId").asText().equals(recovered.runId())&&x.path("originRunId").asText().equals(demo.runId())));
    }
    @Test void corruptVerifiedResultFailsEntireFullExportRatherThanLeakingPrivateField()throws Exception{
        f.prepared();var worker=f.worker(f.off());worker.process(worker.claim("export-result"));db.update("UPDATE mp_execution_record e JOIN mp_experience_run r ON r.id=e.experience_run_id SET e.result_json=JSON_SET(e.result_json,'$.privateLabels','DO_NOT_EXPORT') WHERE r.student_id=? AND e.status='SUCCEEDED'",f.f.student.internalId());assertEquals("PERSONAL_EXPORT_SOURCE_INVALID",assertThrows(ApiException.class,()->build("FULL_PERSONAL_EXPORT")).code);assertEquals(2,unzip(build("REPORTS_ONLY")).size());
    }
}
