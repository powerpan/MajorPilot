package com.ruoyi.majorpilot.intake;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.analytics.*;
import com.ruoyi.majorpilot.recommendation.*;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real local MySQL only. Fixtures are synthetic; cleanup is restricted to IDs created by each test. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class IntakeMySqlTest {
    static JdbcTemplate jdbc; static TransactionTemplate tx; static ObjectMapper mapper;
    final List<Long> intakeIds=new ArrayList<>(),studentIds=new ArrayList<>();
    ProductEvents events; RecommendationStore store; IntakeService intakes; StudentRecommendationService choices; IdempotencyService idem;
    @BeforeAll static void database() {
        String url=System.getenv("MP_DB_URL");
        if(url==null||!url.startsWith("jdbc:mysql://127.0.0.1:13306/majorpilot?"))throw new IllegalStateException("Dedicated local database required");
        var source=new DriverManagerDataSource(url.replace("/majorpilot?","/majorpilot_test?"),System.getenv("MP_DB_USERNAME"),System.getenv("MP_DB_PASSWORD"));
        var flyway=Flyway.configure().dataSource(source).locations("classpath:db/migration").cleanDisabled(true).load();flyway.migrate();flyway.validate();
        jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));mapper=new ObjectMapper().findAndRegisterModules();
    }
    @BeforeEach void services() {
        events=new ProductEvents(jdbc,mapper);store=new RecommendationStore(jdbc,mapper,events);
        idem=new IdempotencyService(jdbc,tx,new Secrets("synthetic-intake-integration-key-".repeat(3)),mapper);
        intakes=new IntakeService(jdbc,mapper,store,idem,events);choices=new StudentRecommendationService(jdbc,store,idem,events);
    }
    @AfterEach void cleanup() {
        transaction(()->{
            for(long student:studentIds){jdbc.update("DELETE FROM mp_product_event WHERE student_id=?",student);jdbc.update("DELETE FROM mp_recommendation_decision WHERE student_id=?",student);jdbc.update("DELETE FROM mp_idempotency_record WHERE owner_student_id=?",student);}
            for(long intake:intakeIds){jdbc.update("DELETE FROM mp_product_event WHERE intake_session_id=?",intake);jdbc.update("DELETE FROM mp_idempotency_record WHERE owner_intake_session_id=?",intake);jdbc.update("DELETE FROM mp_consent_record WHERE intake_session_id=?",intake);}
            var profiles=new ArrayList<Long>();
            for(long intake:intakeIds)profiles.addAll(jdbc.queryForList("SELECT id FROM mp_decision_profile WHERE intake_session_id=?",Long.class,intake));
            for(long student:studentIds)profiles.addAll(jdbc.queryForList("SELECT id FROM mp_decision_profile WHERE student_id=? AND intake_session_id IS NULL",Long.class,student));
            profiles.sort(Comparator.reverseOrder());
            for(long profile:profiles){jdbc.update("DELETE d FROM mp_recommendation_decision d JOIN mp_recommendation r ON r.id=d.recommendation_id WHERE r.decision_profile_id=?",profile);jdbc.update("DELETE rr FROM mp_recommendation_reason rr JOIN mp_recommendation r ON r.id=rr.recommendation_id WHERE r.decision_profile_id=?",profile);jdbc.update("DELETE FROM mp_recommendation WHERE decision_profile_id=?",profile);jdbc.update("DELETE FROM mp_decision_answer WHERE decision_profile_id=?",profile);jdbc.update("DELETE FROM mp_decision_profile WHERE id=?",profile);}
            for(long intake:intakeIds)jdbc.update("DELETE FROM mp_intake_session WHERE id=?",intake);
            for(long student:studentIds)jdbc.update("DELETE FROM mp_student_account WHERE id=?",student);
            return null;
        });
    }
    @Test void draftCasAndUnauthorizedFailuresDoNotRenewSevenDayExpiry() {
        var created=create();long internal=internal(created);Instant deadline=Instant.now().plusSeconds(60).truncatedTo(ChronoUnit.MILLIS);
        jdbc.update("UPDATE mp_intake_session SET expires_at=? WHERE id=?",Timestamp.from(deadline),internal);
        var input=new IntakeService.Draft(Questionnaire.VERSION,1L,"step-1",mapper.createObjectNode().put("applicationStage","EXPLORING"));
        var failure=assertThrows(ApiException.class,()->transaction(()->intakes.save(publicId(created),hash(created),input)));
        assertEquals("INTAKE_REVISION_CONFLICT",failure.code);assertEquals(0L,failure.details.get("currentRevision"));assertEquals(deadline,expiry(internal));
        assertEquals("RESOURCE_NOT_FOUND",assertThrows(ApiException.class,()->transaction(()->intakes.get(publicId(created),Secrets.hash("synthetic-wrong-cookie")))).code);assertEquals(deadline,expiry(internal));
        Instant before=Instant.now();var saved=transaction(()->intakes.save(publicId(created),hash(created),new IntakeService.Draft(Questionnaire.VERSION,0L,"step-1",input.answers())));
        assertEquals(1,saved.revision());assertFalse(saved.expiresAt().isBefore(before.plusSeconds(7*86400)));assertEquals(saved.answers().get("applicationStage").asText(),"EXPLORING");
    }
    @Test void concurrentAndDifferentKeySubmitFreezeOnlyOneProfilePerSourceRevision() throws Exception {
        var created=create();var input=submission(0);String key=key();
        try(var workers=Executors.newFixedThreadPool(2)) {
            var outcomes=workers.invokeAll(List.<Callable<RecommendationView>>of(()->transaction(()->intakes.submit(publicId(created),hash(created),key,input)),()->transaction(()->intakes.submit(publicId(created),hash(created),key,input))));
            assertEquals(outcomes.get(0).get().recommendationId(),outcomes.get(1).get().recommendationId());
            var replay=transaction(()->intakes.submit(publicId(created),hash(created),key(),input));assertEquals(outcomes.getFirst().get().recommendationId(),replay.recommendationId());
        }
        assertEquals(1,count("mp_decision_profile","intake_session_id",internal(created)));assertEquals(13,jdbc.queryForObject("SELECT COUNT(*) FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id WHERE p.intake_session_id=?",Integer.class,internal(created)));
        assertEquals(1L,jdbc.queryForObject("SELECT row_version FROM mp_intake_session WHERE id=?",Long.class,internal(created)));
        var altered=IntakeFixtures.answers();altered.put("applicationStage","RESEARCHING_PROGRAMS");
        assertEquals("INTAKE_REVISION_CONFLICT",assertThrows(ApiException.class,()->transaction(()->intakes.submit(publicId(created),hash(created),key(),new IntakeService.Submission(Questionnaire.VERSION,0L,altered)))).code);
    }
    @Test void failedRecommendationTransactionRollsBackProfileReasonsFactsAndIdempotency() {
        var created=create();Instant before=expiry(internal(created));
        ProductEvents failing=new ProductEvents(jdbc,mapper){@Override public void record(Long student,Long intake,Long recommendation,String name,Map<String,?> properties){super.record(student,intake,recommendation,name,properties);if(name.equals("recommendation.generated"))throw new ApiException(503,"SYNTHETIC_EVENT_FAILURE");}};
        var failingStore=new RecommendationStore(jdbc,mapper,failing);var failingService=new IntakeService(jdbc,mapper,failingStore,idem,failing);
        assertEquals("SYNTHETIC_EVENT_FAILURE",assertThrows(ApiException.class,()->transaction(()->failingService.submit(publicId(created),hash(created),key(),submission(0)))).code);
        assertEquals(0,count("mp_decision_profile","intake_session_id",internal(created)));assertEquals(0,count("mp_idempotency_record","owner_intake_session_id",internal(created)));assertEquals(1,count("mp_product_event","intake_session_id",internal(created)));assertEquals(before,expiry(internal(created)));
        assertEquals("DRAFT",jdbc.queryForObject("SELECT status FROM mp_intake_session WHERE id=?",String.class,internal(created)));
    }
    @Test void concurrentClaimHasSingleOwnerAndKeepsAllImmutableVersions() throws Exception {
        var created=create();var first=transaction(()->intakes.submit(publicId(created),hash(created),key(),submission(0)));
        transaction(()->intakes.save(publicId(created),hash(created),new IntakeService.Draft(Questionnaire.VERSION,1L,"step-1",mapper.createObjectNode().put("applicationStage","RESEARCHING_PROGRAMS"))));
        var changed=IntakeFixtures.answers();changed.put("applicationStage","RESEARCHING_PROGRAMS");
        var second=transaction(()->intakes.submit(publicId(created),hash(created),key(),new IntakeService.Submission(Questionnaire.VERSION,2L,changed)));
        String frozen=jdbc.queryForObject("SELECT safe_result_json FROM mp_recommendation WHERE public_id=?",String.class,first.recommendationId());
        var one=student();var two=student();
        try(var workers=Executors.newFixedThreadPool(2)) {
            var claims=workers.invokeAll(List.<Callable<Boolean>>of(()->claim(created,one),()->claim(created,two)));int successes=0;for(var result:claims)if(result.get())successes++;assertEquals(1,successes);
        }
        long owner=jdbc.queryForObject("SELECT claimed_student_id FROM mp_intake_session WHERE id=?",Long.class,internal(created));assertEquals(2,count("mp_decision_profile","student_id",owner));assertEquals(2,count("mp_recommendation","student_id",owner));
        assertEquals(frozen,jdbc.queryForObject("SELECT safe_result_json FROM mp_recommendation WHERE public_id=?",String.class,first.recommendationId()));
        assertEquals("SUPERSEDED",jdbc.queryForObject("SELECT status FROM mp_decision_profile WHERE public_id=?",String.class,first.decisionProfileId()));assertEquals(2,second.profileVersion());
        assertEquals("INTAKE_ALREADY_CLAIMED",assertThrows(ApiException.class,()->transaction(()->intakes.get(publicId(created),hash(created)))).code);
        assertEquals("{}",jdbc.queryForObject("SELECT CAST(draft_json AS CHAR) FROM mp_intake_session WHERE id=?",String.class,internal(created)));
        StudentPrincipal winner=owner==one.internalId()?one:two;var accepted=transaction(()->choices.decide(winner,second.recommendationId(),key(),new StudentRecommendationService.DecisionInput("AI",null,null)));
        var override=transaction(()->choices.decide(winner,second.recommendationId(),key(),new StudentRecommendationService.DecisionInput("DATA_SCIENCE","DECLINED",null)));
        assertEquals("ACCEPTED",accepted.decisionType());assertEquals("OVERRIDDEN",override.decisionType());assertEquals(2,override.decisionNo());assertEquals("UNAVAILABLE",override.availability());
        assertEquals(frozen,jdbc.queryForObject("SELECT safe_result_json FROM mp_recommendation WHERE public_id=?",String.class,first.recommendationId()));
    }
    @Test void expiredAnonymousTreeIsPhysicallyPurgedButClaimedTreeIsPreserved() {
        var expired=create();var claimed=create();long expiredId=internal(expired);transaction(()->intakes.submit(publicId(expired),hash(expired),key(),submission(0)));transaction(()->intakes.submit(publicId(claimed),hash(claimed),key(),submission(0)));assertTrue(claim(claimed,student()));
        Instant cutoff=Instant.parse("1971-01-01T00:00:00Z");for(var created:List.of(expired,claimed))jdbc.update("UPDATE mp_intake_session SET expires_at=? WHERE id=?",Timestamp.from(cutoff.minusSeconds(1)),internal(created));
        assertEquals("INTAKE_EXPIRED",assertThrows(ApiException.class,()->transaction(()->intakes.get(publicId(expired),hash(expired)))).code);
        assertEquals(1,new IntakeRetention(jdbc,tx).purgeExpired(cutoff,10));assertEquals(0,count("mp_intake_session","id",expiredId));assertEquals(0,count("mp_product_event","intake_session_id",expiredId));assertEquals(0,count("mp_idempotency_record","owner_intake_session_id",expiredId));assertEquals(0,count("mp_decision_profile","intake_session_id",expiredId));
        assertEquals(1,count("mp_intake_session","id",internal(claimed)));assertEquals(1,count("mp_decision_profile","intake_session_id",internal(claimed)));
    }
    @Test void pageEventBatchIsOwnerScopedAtomicAndDeduplicated() {
        var one=create();var two=create();var recommendation=transaction(()->intakes.submit(publicId(one),hash(one),key(),submission(0)));var foreign=transaction(()->intakes.submit(publicId(two),hash(two),key(),submission(0)));
        var pages=new PageEventService(jdbc,mapper,intakes,mock(RateLimits.class),events);var valid=observation(recommendation.recommendationId());Instant before=expiry(internal(one));
        assertEquals("EVENT_BATCH_INVALID",assertThrows(ApiException.class,()->transaction(()->pages.intake(hash(one),new PageEventService.Batch(List.of(valid,observation(foreign.recommendationId())))))).code);assertEquals(before,expiry(internal(one)));assertEquals(0,views(internal(one)));
        assertEquals(1,transaction(()->pages.intake(hash(one),new PageEventService.Batch(List.of(valid)))).acceptedCount());
        assertEquals(1,transaction(()->pages.intake(hash(one),new PageEventService.Batch(List.of(valid)))).duplicateCount());
        assertEquals(1,transaction(()->pages.intake(hash(one),new PageEventService.Batch(List.of(observation(recommendation.recommendationId()))))).duplicateCount());assertEquals(1,views(internal(one)));
    }
    private IntakeService.Created create(){var result=transaction(()->intakes.create(Questionnaire.VERSION,null));intakeIds.add(jdbc.queryForObject("SELECT id FROM mp_intake_session WHERE public_id=?",Long.class,result.view().intakeSessionId()));return result;}
    private StudentPrincipal student(){String id=PublicIds.next(),email="intake-fixture-"+id.toLowerCase(Locale.ROOT)+"@example.invalid";jdbc.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash,status,email_verified_at) VALUES(?,?,?,'synthetic-unused-hash','ACTIVE',UTC_TIMESTAMP(3))",id,email,email);long internal=jdbc.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,id);studentIds.add(internal);return new StudentPrincipal(internal,id,"ACTIVE");}
    private boolean claim(IntakeService.Created created,StudentPrincipal student){try{return transaction(()->{var claim=intakes.lockClaimable(publicId(created),hash(created));intakes.claimAll(claim.intakeInternalId(),student.internalId());return true;});}catch(ApiException conflict){assertEquals("INTAKE_ALREADY_CLAIMED",conflict.code);return false;}}
    private static IntakeService.Submission submission(long revision){return new IntakeService.Submission(Questionnaire.VERSION,revision,IntakeFixtures.answers());}
    private static PageEventService.Observation observation(String recommendation){return new PageEventService.Observation(key(),"recommendation.viewed","v1",Instant.now(),"RECOMMENDATION",recommendation,1000L,mapper.createObjectNode());}
    private static String key(){return UUID.randomUUID().toString();}
    private static String publicId(IntakeService.Created created){return created.view().intakeSessionId();}
    private static String hash(IntakeService.Created created){return Secrets.hash(created.newSecret());}
    private static long internal(IntakeService.Created created){return jdbc.queryForObject("SELECT id FROM mp_intake_session WHERE public_id=?",Long.class,publicId(created));}
    private static Instant expiry(long id){return DbTimes.instant(jdbc.queryForMap("SELECT expires_at FROM mp_intake_session WHERE id=?",id).get("expires_at"));}
    private static int count(String table,String column,long id){return jdbc.queryForObject("SELECT COUNT(*) FROM "+table+" WHERE "+column+"=?",Integer.class,id);}
    private static int views(long id){return jdbc.queryForObject("SELECT COUNT(*) FROM mp_product_event WHERE intake_session_id=? AND event_name='recommendation.viewed'",Integer.class,id);}
    private static <T>T transaction(Supplier<T> action){return tx.execute(status->action.get());}
}
