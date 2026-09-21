package com.ruoyi.majorpilot.analytics;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.env.MockEnvironment;
import com.ruoyi.majorpilot.intake.IntakeService;

/** Query-boundary tests; real MySQL uniqueness/transaction tests are separate and opt-in. */
class PageRunEventTest {
    static final ObjectMapper JSON=new ObjectMapper().findAndRegisterModules();
    static final Instant NOW=Instant.parse("2026-09-21T00:00:00Z");
    final String runId=PublicIds.next(),taskId=PublicIds.next();
    final StudentPrincipal student=new StudentPrincipal(1,PublicIds.next(),"ACTIVE");
    JdbcTemplate db;PageEventService service;Map<String,Object> row;List<Map<String,Object>> states;
    final List<Object[]> writes=new ArrayList<>();Instant previousResume;
    @BeforeEach void setup() throws Exception {
        db=mock(JdbcTemplate.class);row=new HashMap<>();
        when(db.queryForObject(startsWith("SELECT COUNT(*) FROM mp_experience_run r WHERE"),eq(Integer.class),eq(1L),eq(5L))).thenReturn(0);
        row.put("id",5L);row.put("content_kind","MAJOR");row.put("run_mode","STANDARD");row.put("status","IN_PROGRESS");
        row.put("started_at",Timestamp.from(NOW.minusSeconds(30)));row.put("task_version_id",7L);row.put("task_public_id",taskId);
        row.put("task_kind","MAJOR");row.put("major_id",1L);row.put("task_major_id",1L);
        row.put("version_code","fixture-1");row.put("task_status","PUBLISHED");row.put("major_code","AI");
        row.put("manifest_json","{\"taskVersionId\":\""+taskId+"\",\"steps\":[{\"stepKey\":\"step-one\",\"dependencies\":[]},{\"stepKey\":\"step-two\",\"dependencies\":[\"step-one\"]}]}");
        states=new ArrayList<>(List.of(Map.of("step_key","step-one","status","IN_PROGRESS"),Map.of("step_key","step-two","status","NOT_STARTED")));
        when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(call->{
            String sql=call.getArgument(0);Object[] args=(Object[])call.getRawArguments()[1];
            if(sql.startsWith("SELECT status FROM mp_student_account"))return List.of(Map.of("status","ACTIVE"));
            if(sql.startsWith("SELECT r.id"))return runId.equals(args[0])&&Long.valueOf(1).equals(args[1])?List.of(row):List.of();
            if(sql.startsWith("SELECT step_key,status"))return states;
            if(sql.startsWith("SELECT received_at"))return previousResume==null?List.of():List.of(Map.of("received_at",Timestamp.from(previousResume)));
            throw new AssertionError("Unexpected safe query shape");
        });
        when(db.update(anyString(),any(Object[].class))).thenAnswer(call->{
            Object[] args=((Object[])call.getRawArguments()[1]).clone();assertEquals(18,args.length);writes.add(args);
            if(args[3].toString().endsWith("experience.run.resumed"))previousResume=((Timestamp)args[5]).toInstant();return 1;
        });
        service=service(true,true);
    }
    PageEventService service(boolean demo,boolean preview){return new PageEventService(db,JSON,null,mock(RateLimits.class),new ProductEvents(db,JSON),demo,preview,Clock.fixed(NOW,ZoneOffset.UTC));}
    PageEventService.Observation event(String name,String step){var props=JSON.createObjectNode().put("stepKey",step);if(name.endsWith("resumed"))props.put("inactivityBucket","MINUTES_10_60");return new PageEventService.Observation(UUID.randomUUID().toString(),name,"v1",NOW,"EXPERIENCE_RUN",runId,1000L,props);}
    PageEventService.Accepted send(PageEventService.Observation... observations){return service.student(student,new PageEventService.Batch(List.of(observations)));}
    @Test void addsOnlyServerPinnedOwnershipVersionAndStepAndUsesPerStepDedupe() throws Exception {
        assertEquals(1,send(event("experience.step.viewed","step-one")).acceptedCount());
        Object[] write=writes.getFirst();assertEquals("experience.step.viewed",write[3]);assertEquals(1L,write[6]);
        assertEquals(5L,write[11]);assertEquals(7L,write[12]);assertEquals("AI",write[13]);assertEquals("step-one",write[14]);
        var props=JSON.readTree((String)write[16]);assertEquals(taskId,props.path("taskVersion").asText());assertEquals("fixture-1",props.path("taskVersionCode").asText());
        String expected=Secrets.hash("student:1\0experience.step.viewed\0"+runId+"\0"+taskId+"\0step-one");assertEquals(expected,write[17]);
        assertFalse(props.has("studentId"));assertFalse(props.has("occurredAt"));
    }
    @Test void validatesWholeBatchBeforeAnyWritesIncludingUnavailableStep() {
        assertEquals("EVENT_BATCH_INVALID",assertThrows(ApiException.class,()->send(event("experience.step.viewed","step-one"),event("experience.step.viewed","step-two"))).code);
        assertTrue(writes.isEmpty());
        assertThrows(ApiException.class,()->send(event("experience.step.viewed","missing-step")));assertTrue(writes.isEmpty());
    }
    @Test void wrongOwnerReadyUnstartedAndUnpublishedTasksCannotManufactureViews() {
        assertThrows(ApiException.class,()->service.student(new StudentPrincipal(2,PublicIds.next(),"ACTIVE"),new PageEventService.Batch(List.of(event("experience.step.viewed","step-one")))));
        row.put("status","READY");assertThrows(ApiException.class,()->send(event("experience.step.viewed","step-one")));
        row.put("status","IN_PROGRESS");row.put("started_at",null);assertThrows(ApiException.class,()->send(event("experience.step.viewed","step-one")));
        row.put("started_at",Timestamp.from(NOW.minusSeconds(1)));row.put("task_status","DRAFT");assertThrows(ApiException.class,()->send(event("experience.step.viewed","step-one")));
        assertTrue(writes.isEmpty());
    }
    @Test void pausedClosedAndReplacedReadOnlyViewsRemainObservationsNotStarts() {
        for(String status:List.of("PAUSED","CLOSED","REPLACED","TASK_COMPLETED")) {row.put("status",status);assertEquals(1,send(event("experience.step.viewed","step-one")).acceptedCount());}
        assertTrue(writes.stream().allMatch(w->w[3].equals("experience.step.viewed")));
    }
    @Test void demoAndPreviewGatesAndStoredPrefixesPreserveFormalAnalyticsIsolation() {
        row.put("run_mode","REVIEW_PREVIEW");row.put("task_status","REVIEW");service=service(false,false);
        assertThrows(ApiException.class,()->send(event("experience.step.viewed","step-one")));service=service(false,true);
        send(event("experience.step.viewed","step-one"));assertEquals("preview.experience.step.viewed",writes.getFirst()[3]);
        row.put("content_kind","DEMO");row.put("task_kind","DEMO");row.put("major_id",null);row.put("task_major_id",null);
        row.put("demo_key","DEMO_TABLE");row.put("task_demo_key","DEMO_TABLE");row.put("run_mode","STANDARD");row.put("task_status","PUBLISHED");row.put("major_code",null);
        assertThrows(ApiException.class,()->send(event("experience.step.viewed","step-one")));service=service(true,false);
        send(event("experience.step.viewed","step-one"));assertEquals("demo.experience.step.viewed",writes.getLast()[3]);assertNull(writes.getLast()[13]);
    }
    @Test void resumeUsesTenMinuteReceivingClockAndNoLifetimeDedupeKey() {
        previousResume=NOW.minusMillis(599999);assertEquals(new PageEventService.Accepted(0,1),send(event("experience.run.resumed","step-one")));
        assertTrue(writes.isEmpty());previousResume=NOW.minusSeconds(600);
        assertEquals(new PageEventService.Accepted(1,1),send(event("experience.run.resumed","step-one"),event("experience.run.resumed","step-one")));
        assertNull(writes.getFirst()[17]);assertEquals(1,writes.size());
    }
    @Test void productionSpringConstructorWiresAndDefaultsPreviewGateClosed() {
        try(var context=new AnnotationConfigApplicationContext()) {
            context.setEnvironment(new MockEnvironment());context.getEnvironment().setActiveProfiles("local");
            context.registerBean(JdbcTemplate.class,()->db);context.registerBean(ObjectMapper.class,()->JSON);
            context.registerBean(IntakeService.class,()->mock(IntakeService.class));context.registerBean(RateLimits.class,()->mock(RateLimits.class));
            context.registerBean(ProductEvents.class,()->new ProductEvents(db,JSON));context.register(PageEventService.class);
            assertDoesNotThrow(context::refresh);row.put("run_mode","REVIEW_PREVIEW");row.put("task_status","REVIEW");
            row.put("started_at",Timestamp.from(Instant.now().minusSeconds(30)));
            var observed=event("experience.step.viewed","step-one");
            var current=new PageEventService.Observation(observed.clientEventId(),observed.eventName(),observed.eventVersion(),Instant.now(),
                observed.contextType(),observed.contextPublicId(),observed.visibleDurationMs(),observed.properties());
            assertThrows(ApiException.class,()->context.getBean(PageEventService.class).student(student,
                new PageEventService.Batch(List.of(current))));
            assertTrue(writes.isEmpty());
        }
    }
    @Test void publicIntakeCannotSendStudentRunObservationsOrExtendItsExpiryOnFailure() {
        JdbcTemplate publicDb=mock(JdbcTemplate.class);IntakeService scopes=mock(IntakeService.class);
        String intakeId=PublicIds.next(),secretHash="synthetic-intake-hash";
        when(publicDb.queryForList("SELECT public_id FROM mp_intake_session WHERE secret_hash=?",secretHash))
            .thenReturn(List.of(Map.of("public_id",intakeId)));
        when(scopes.authenticateForEvent(intakeId,secretHash)).thenReturn(3L);
        var anonymous=new PageEventService(publicDb,JSON,scopes,mock(RateLimits.class),new ProductEvents(publicDb,JSON),true,true,Clock.fixed(NOW,ZoneOffset.UTC));
        assertEquals("EVENT_BATCH_INVALID",assertThrows(ApiException.class,()->anonymous.intake(secretHash,
            new PageEventService.Batch(List.of(event("experience.step.viewed","step-one"))))).code);
        verify(publicDb,never()).update(anyString(),any(Object[].class));verify(scopes,never()).touchForEvent(anyLong());
    }
}
