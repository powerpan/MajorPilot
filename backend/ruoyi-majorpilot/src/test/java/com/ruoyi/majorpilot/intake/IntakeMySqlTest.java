package com.ruoyi.majorpilot.intake;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.analytics.*;
import com.ruoyi.majorpilot.auth.*;
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
    ProductEvents events; RecommendationStore store; IntakeService intakes; StudentRecommendationService choices; IdempotencyService idem; ProfileService profiles;
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
        intakes=new IntakeService(jdbc,mapper,store,idem,events);choices=new StudentRecommendationService(jdbc,store,idem,events);profiles=new ProfileService(jdbc,mapper,store,idem);
    }
    @AfterEach void cleanup() {
        transaction(()->{
            for(long student:studentIds){for(String table:List.of("mp_security_event","mp_email_token","mp_student_session","mp_consent_record"))jdbc.update("DELETE FROM "+table+" WHERE student_id=?",student);jdbc.update("DELETE FROM mp_product_event WHERE student_id=?",student);jdbc.update("DELETE FROM mp_recommendation_decision WHERE student_id=?",student);jdbc.update("DELETE FROM mp_idempotency_record WHERE owner_student_id=?",student);}
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
            // GET_LOCK(...,0) deliberately returns a transient 409 while the other
            // transaction's afterCompletion is releasing its advisory lock.
            // invokeAll has joined both transactions: replay the SAME key now,
            // without accepting any other failure or repeating the business action.
            var completed=new ArrayList<RecommendationView>();int inProgress=0;
            for(var outcome:outcomes)try{completed.add(outcome.get());}catch(ExecutionException failure){
                var error=assertInstanceOf(ApiException.class,failure.getCause());assertEquals(409,error.status);assertEquals("REQUEST_IN_PROGRESS",error.code);inProgress++;
            }
            assertFalse(completed.isEmpty());assertTrue(inProgress<=1);
            var sameKey=transaction(()->intakes.submit(publicId(created),hash(created),key,input));
            for(var value:completed)assertEquals(value.recommendationId(),sameKey.recommendationId());
            var replay=transaction(()->intakes.submit(publicId(created),hash(created),key(),input));assertEquals(sameKey.recommendationId(),replay.recommendationId());
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
    @Test void partialFinishKeepsSkipMissingAndUncertaintyDistinctAndRemainsClaimable(){
        var created=create();var answers=mapper.createObjectNode().putNull("applicationStage").put("targetIntakeWindow","UNSURE");
        String idemKey=key();var request=new IntakeService.Submission(Questionnaire.VERSION,0L,answers);
        var finished=transaction(()->intakes.finish(publicId(created),hash(created),idemKey,request));
        assertNull(finished.recommendation());assertFalse(finished.profile().complete());assertFalse(finished.profile().recommendationReady());
        assertEquals(answers,finished.profile().answers());assertEquals("SKIPPED",finished.profile().answerStates().get("applicationStage"));assertEquals("UNSURE",finished.profile().answerStates().get("targetIntakeWindow"));assertEquals("MISSING",finished.profile().answerStates().get("currentField"));
        assertEquals(finished,transaction(()->intakes.finish(publicId(created),hash(created),idemKey,request)));assertEquals(finished,transaction(()->intakes.finish(publicId(created),hash(created),key(),request)));
        assertEquals("RECOMMENDATION_NOT_FOUND",assertThrows(ApiException.class,()->transaction(()->intakes.recommendation(publicId(created),hash(created)))).code);
        var student=student();assertTrue(claim(created,student));assertEquals(answers,transaction(()->profiles.get(student)).profile().answers());assertNull(transaction(()->choices.dashboard(student)).get("recommendation"));
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id WHERE p.student_id=?",Integer.class,student.internalId()));
    }
    @Test void emptyFinishDoesNotInventAcquisitionChannelOrRecommendation(){
        var created=create();var finished=transaction(()->intakes.finish(publicId(created),hash(created),key(),new IntakeService.Submission(Questionnaire.VERSION,0L,mapper.createObjectNode())));
        assertTrue(finished.profile().answers().isEmpty());assertNull(finished.recommendation());assertEquals(13,finished.profile().answerStates().size());assertTrue(finished.profile().answerStates().values().stream().allMatch("MISSING"::equals));
        assertEquals("MISSING",transaction(()->intakes.lockClaimable(publicId(created),hash(created))).acquisitionChannelCode());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id WHERE p.intake_session_id=?",Integer.class,internal(created)));
    }
    @Test void emptyIntakeRegistrationStillRequiresConsentAndRealEmailVerification(){
        var intake=create();transaction(()->intakes.finish(publicId(intake),hash(intake),key(),new IntakeService.Submission(Questionnaire.VERSION,0L,mapper.createObjectNode())));
        var secrets=new Secrets("offline-profile-auth-secret-".repeat(3));var mail=mock(AuthMailGateway.class);when(mail.send(anyLong(),eq("VERIFY_EMAIL"),anyString())).thenReturn(true);
        var auth=new AuthService(jdbc,tx,intakes,idem,new StudentPasswords(),new StudentSessions(jdbc),mock(RateLimits.class),mail,new SecurityEvents(jdbc,secrets),secrets,events);
        String email="empty-profile-"+PublicIds.next().toLowerCase(Locale.ROOT)+"@example.invalid",password="synthetic registration passphrase";
        assertEquals("CONSENT_REQUIRED",assertThrows(ApiException.class,()->auth.register(new AuthDtos.Register(publicId(intake),email,password,List.of()),hash(intake),key(),"fixture","fixture")).code);
        var consents=List.of(new AuthDtos.Consent("TERMS","v1","ACCEPTED"),new AuthDtos.Consent("PRIVACY","v1","ACCEPTED"));
        var result=auth.register(new AuthDtos.Register(publicId(intake),email,password,consents),hash(intake),key(),"fixture","fixture");
        long id=jdbc.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,result.studentId());studentIds.add(id);
        assertEquals("PENDING_VERIFICATION",result.status());assertEquals("VERIFY_EMAIL",result.nextAction());assertEquals("SENT",result.emailDeliveryStatus());
        var principal=new StudentPrincipal(id,result.studentId(),"PENDING_VERIFICATION");assertFalse(auth.me(principal).canStartExperience());assertFalse(auth.me(principal).emailVerified());assertEquals("EMAIL_NOT_VERIFIED",assertThrows(ApiException.class,()->transaction(()->profiles.get(principal))).code);
        var token=org.mockito.ArgumentCaptor.forClass(String.class);verify(mail).send(eq(id),eq("VERIFY_EMAIL"),token.capture());auth.verify(token.getValue(),"fixture","fixture");
        assertTrue(auth.me(principal).canStartExperience());assertTrue(auth.me(principal).emailVerified());assertTrue(transaction(()->profiles.get(principal)).profile().answers().isEmpty());assertEquals(2,auth.consents(principal).size());
    }
    @Test void accountDraftSubmitCancelAndStaleTabsPreserveFormalHistory(){
        var student=student();var first=transaction(()->profiles.submit(student,key(),profileInput(0,0,IntakeFixtures.answers(),"EDIT")));
        assertTrue(first.profile().complete());assertNotNull(first.recommendation());assertEquals(1,first.draftRevision());
        var draft=transaction(()->profiles.save(student,profileInput(1,1,mapper.createObjectNode(),"RESTART")));
        assertTrue(draft.draft().answers().isEmpty());assertEquals(first.profile(),draft.profile());assertEquals(draft,transaction(()->profiles.get(student)));
        assertEquals("PROFILE_DRAFT_CONFLICT",assertThrows(ApiException.class,()->transaction(()->profiles.save(student,profileInput(1,1,mapper.createObjectNode(),"EDIT")))).code);
        var cancelled=transaction(()->profiles.discard(student,new ProfileService.Revision(2L)));assertNull(cancelled.draft());assertEquals(3,cancelled.draftRevision());assertEquals(first.profile(),cancelled.profile());
        var partial=mapper.createObjectNode().putNull("scenarioPreference");partial.putObject("majorFamiliarity").put("AI","UNFAMILIAR");partial.put("targetIntakeWindow","UNSURE");
        String submitKey=key();var input=profileInput(3,1,partial,"RESTART");var second=transaction(()->profiles.submit(student,submitKey,input));
        assertEquals(2,second.profile().profileVersion());assertEquals(partial,second.profile().answers());assertNull(second.recommendation());assertNull(store.latestStudent(student.internalId()));assertEquals(second,transaction(()->profiles.submit(student,submitKey,input)));
        assertEquals("PROFILE_DRAFT_CONFLICT",assertThrows(ApiException.class,()->transaction(()->profiles.submit(student,key(),input))).code);
        assertEquals("PROFILE_VERSION_CONFLICT",assertThrows(ApiException.class,()->transaction(()->profiles.save(student,profileInput(4,1,partial,"EDIT")))).code);
        assertEquals(2,count("mp_decision_profile","student_id",student.internalId()));assertEquals(first.profile().answers(),store.profile(jdbc.queryForObject("SELECT id FROM mp_decision_profile WHERE public_id=?",Long.class,first.profile().decisionProfileId())).answers());
        assertEquals("SUPERSEDED",jdbc.queryForObject("SELECT status FROM mp_decision_profile WHERE public_id=?",String.class,first.profile().decisionProfileId()));
        var another=student();assertNull(transaction(()->profiles.get(another)).profile());assertNull(transaction(()->profiles.get(another)).draft());
    }
    @Test void realRankingFieldsCanRecommendWithoutInventingTheOtherBackground(){
        var student=student();var source=IntakeFixtures.answers();var answers=mapper.createObjectNode();for(String field:List.of("consideredMajors","majorFamiliarity","scenarioPreference","workElements"))answers.set(field,source.get(field));
        var result=transaction(()->profiles.submit(student,key(),profileInput(0,0,answers,"EDIT")));
        assertFalse(result.profile().complete());assertTrue(result.profile().recommendationReady());assertNotNull(result.recommendation());assertEquals(answers,result.profile().answers());assertEquals("MISSING",result.profile().answerStates().get("applicationStage"));assertEquals(4,jdbc.queryForObject("SELECT COUNT(*) FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id WHERE p.student_id=?",Integer.class,student.internalId()));
    }
    @Test void concurrentProfileSubmissionsAppendExactlyOneVersion()throws Exception{
        var student=student();var input=profileInput(0,0,mapper.createObjectNode(),"RESTART");
        try(var pool=Executors.newFixedThreadPool(2)){
            var jobs=pool.invokeAll(List.<Callable<String>>of(()->submitOutcome(student,input),()->submitOutcome(student,input)));
            var outcomes=new ArrayList<String>();for(var job:jobs)outcomes.add(job.get());assertEquals(1,Collections.frequency(outcomes,"SUCCESS"));assertEquals(1,Collections.frequency(outcomes,"PROFILE_DRAFT_CONFLICT"));
        }
        assertEquals(1,count("mp_decision_profile","student_id",student.internalId()));assertEquals(1,transaction(()->profiles.get(student)).draftRevision());
    }
    private String submitOutcome(StudentPrincipal student,ProfileService.Input input){try{transaction(()->profiles.submit(student,key(),input));return "SUCCESS";}catch(ApiException conflict){return conflict.code;}}
    private static ProfileService.Input profileInput(long revision,long base,com.fasterxml.jackson.databind.JsonNode answers,String mode){return new ProfileService.Input(Questionnaire.VERSION,revision,base,answers,"step-1",mode);}
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
