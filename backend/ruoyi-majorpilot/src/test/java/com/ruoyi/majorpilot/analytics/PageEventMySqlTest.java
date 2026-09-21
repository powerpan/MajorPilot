package com.ruoyi.majorpilot.analytics;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.experience.*;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;

/** Synthetic Students and real Run state machine, constrained to the project test schema. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class PageEventMySqlTest {
    static JdbcTemplate db;static TransactionTemplate tx;static ObjectMapper json;static PublishedTaskContentProvider content;
    final List<StudentPrincipal> owners=new ArrayList<>();StudentPrincipal student;RunService runs;
    RunDtos.Run run;PageEventService pages;MutableClock clock;
    @BeforeAll static void database() {
        String url=System.getenv("MP_DB_URL");
        if(url==null||!url.startsWith("jdbc:mysql://127.0.0.1:13306/majorpilot?"))throw new IllegalStateException("Dedicated test database required");
        var source=new DriverManagerDataSource(url.replace("/majorpilot?","/majorpilot_test?"),System.getenv("MP_DB_USERNAME"),System.getenv("MP_DB_PASSWORD"));
        db=new JdbcTemplate(source);assertEquals("majorpilot_test",db.queryForObject("SELECT DATABASE()",String.class));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").cleanDisabled(true).load().migrate();
        tx=new TransactionTemplate(new DataSourceTransactionManager(source));json=new ObjectMapper().findAndRegisterModules();
        var repository=new TaskContentRepository(json);new TaskPublicationService(db,tx,repository,json,true).installTechnicalDemos();
        content=new PublishedTaskContentProvider(db,repository,true);
    }
    @BeforeEach void setup() {
        student=owner();var idem=new IdempotencyService(db,tx,new Secrets("synthetic-p7-page-observation-".repeat(3)),json);
        runs=new RunService(new RunStore(db,json,true),content,idem,tx);run=start(student);
        clock=new MutableClock(Instant.now().truncatedTo(ChronoUnit.MILLIS).plusSeconds(1));pages=pages(db,true);
    }
    StudentPrincipal owner() {
        String id=PublicIds.next(),email="p7-page-"+id.toLowerCase(Locale.ROOT)+"@example.invalid";
        db.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash,status,email_verified_at,analytics_exclusion_code) VALUES(?,?,?,'synthetic-unused-hash','ACTIVE',UTC_TIMESTAMP(3),'TEST')",id,email,email);
        long internal=db.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,id);
        StudentPrincipal owner=new StudentPrincipal(internal,id,"ACTIVE");owners.add(owner);
        db.update("INSERT INTO mp_decision_profile(public_id,student_id,profile_version_no,questionnaire_version,status,submitted_at,profile_summary_json) VALUES(?,?,1,'decision-profile-v1','SUBMITTED',UTC_TIMESTAMP(3),'{}')",PublicIds.next(),internal);
        return owner;
    }
    PageEventService pages(JdbcTemplate jdbc,boolean enabled) {return new PageEventService(jdbc,json,null,mock(RateLimits.class),new ProductEvents(jdbc,json),enabled,false,clock);}
    RunDtos.Run start(StudentPrincipal owner) {var ready=runs.create(owner,key(),new RunDtos.Create(null,"DEMO_TABLE",null));return runs.transition(owner,ready.runId(),"start",key(),new RunDtos.Transition(ready.revision(),null,null));}
    static String key(){return UUID.randomUUID().toString();}
    PageEventService.Observation event(String name,String runId,String step) {
        var p=json.createObjectNode().put("stepKey",step);if(name.endsWith("resumed"))p.put("inactivityBucket","MINUTES_10_60");
        return new PageEventService.Observation(key(),name,"v1",clock.instant(),"EXPERIENCE_RUN",runId,1000L,p);
    }
    PageEventService.Accepted send(PageEventService.Observation... observations) {return tx.execute(status->pages.student(student,new PageEventService.Batch(List.of(observations))));}
    long observations(){return db.queryForObject("SELECT COUNT(*) FROM mp_product_event WHERE student_id=? AND source='STUDENT_WEB'",Long.class,student.internalId());}
    void unlockSecond(){var saved=runs.save(student,run.runId(),"prepare",new RunDtos.Save(0L,"demo-response-v1",json.createObjectNode().put("acknowledged",true)));runs.completeStep(student,run.runId(),"prepare",key(),new RunDtos.Revision(saved.revision()));}
    @AfterEach void cleanup() {
        for(StudentPrincipal owner:owners) {
            long id=owner.internalId();db.update("DELETE FROM mp_product_event WHERE student_id=?",id);
            db.update("DELETE FROM mp_idempotency_record WHERE owner_student_id=?",id);
            db.update("DELETE c FROM mp_step_completion c JOIN mp_step_state s ON s.id=c.step_state_id JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",id);
            db.update("DELETE v FROM mp_step_response_revision v JOIN mp_step_state s ON s.id=v.step_state_id JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",id);
            db.update("DELETE s FROM mp_step_state s JOIN mp_experience_run r ON r.id=s.experience_run_id WHERE r.student_id=?",id);
            db.update("DELETE FROM mp_experience_run WHERE student_id=?",id);db.update("DELETE FROM mp_decision_profile WHERE student_id=?",id);
            db.update("DELETE FROM mp_student_account WHERE id=?",id);
        }
    }
    @Test void fixedStepAndClientDedupeKeepDifferentStepsAndServerMetadataDistinct() throws Exception {
        var first=event("experience.step.viewed",run.runId(),"prepare");assertEquals(new PageEventService.Accepted(1,0),send(first));
        assertEquals(new PageEventService.Accepted(0,1),send(first));
        assertEquals(new PageEventService.Accepted(0,1),send(event("experience.step.viewed",run.runId(),"prepare")));
        unlockSecond();assertEquals(1,send(event("experience.step.viewed",run.runId(),"read-sample")).acceptedCount());assertEquals(2,observations());
        var event=db.queryForMap("SELECT * FROM mp_product_event WHERE client_event_id=?",first.clientEventId());
        assertNotNull(event.get("experience_run_id"));assertNotNull(event.get("task_version_id"));assertEquals("prepare",event.get("step_key"));
        assertEquals("demo.experience.step.viewed",event.get("event_name"));assertEquals("STANDARD",event.get("run_mode"));
        assertEquals(run.taskVersionId(),json.readTree(event.get("properties_json").toString()).path("taskVersion").asText());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_product_event WHERE student_id=? AND event_name='demo.experience.run.started'",Integer.class,student.internalId()));
    }
    @Test void resumeCanRecurAtExactTenMinutesButCannotReplayClientIdForever() {
        var first=event("experience.run.resumed",run.runId(),"prepare");assertEquals(1,send(first).acceptedCount());
        clock.advance(599999);assertEquals(1,send(event("experience.run.resumed",run.runId(),"prepare")).duplicateCount());
        clock.advance(1);assertEquals(1,send(event("experience.run.resumed",run.runId(),"prepare")).acceptedCount());
        clock.advance(600000);assertEquals(1,send(first).duplicateCount());assertEquals(2,observations());
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM mp_product_event WHERE student_id=? AND source='STUDENT_WEB' AND dedupe_key IS NULL",Integer.class,student.internalId()));
    }
    @Test void crossAccountOrUnavailableStepMakesWholeBatchAtomic() {
        var other=start(owner());var valid=event("experience.step.viewed",run.runId(),"prepare");
        assertThrows(ApiException.class,()->send(valid,event("experience.step.viewed",other.runId(),"prepare")));assertEquals(0,observations());
        assertThrows(ApiException.class,()->send(valid,event("experience.step.viewed",run.runId(),"read-sample")));assertEquals(0,observations());
    }
    @Test void concurrentResumeBatchesSerializeOnTheStudentAndOnlyOneIsAccepted() throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            var barrier=new CyclicBarrier(2);List<Callable<PageEventService.Accepted>> requests=List.of(
                ()->{barrier.await();return send(event("experience.run.resumed",run.runId(),"prepare"));},
                ()->{barrier.await();return send(event("experience.run.resumed",run.runId(),"prepare"));});
            var answers=pool.invokeAll(requests);assertEquals(1,answers.get(0).get().acceptedCount()+answers.get(1).get().acceptedCount());
        }
        assertEquals(1,observations());
    }
    @Test void readyOrDisabledDemoDoesNotAcceptDisplayObservations() {
        var ready=runs.create(student,key(),new RunDtos.Create(null,"DEMO_COMPARE",null));
        assertThrows(ApiException.class,()->send(event("experience.step.viewed",ready.runId(),"prepare")));
        pages=pages(db,false);assertThrows(ApiException.class,()->send(event("experience.step.viewed",run.runId(),"prepare")));assertEquals(0,observations());
    }
    @Test void insertFailureRollsBackAlreadyInsertedObservations() {
        unlockSecond();var spy=spy(db);AtomicInteger inserted=new AtomicInteger();
        doAnswer(call->{if(inserted.incrementAndGet()==2)throw new IllegalStateException("Synthetic event write failure");return call.callRealMethod();})
            .when(spy).update(startsWith("INSERT INTO mp_product_event"),any(Object[].class));
        pages=pages(spy,true);assertThrows(IllegalStateException.class,()->send(event("experience.step.viewed",run.runId(),"prepare"),event("experience.step.viewed",run.runId(),"read-sample")));
        assertEquals(0,observations());
    }
    static final class MutableClock extends Clock {
        volatile Instant now;MutableClock(Instant now){this.now=now;}
        void advance(long ms){now=now.plusMillis(ms);}
        @Override public ZoneId getZone(){return ZoneOffset.UTC;}
        @Override public Clock withZone(ZoneId zone){if(!ZoneOffset.UTC.equals(zone))throw new IllegalArgumentException("UTC only");return this;}
        @Override public Instant instant(){return now;}
    }
}
