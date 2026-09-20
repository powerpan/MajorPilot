package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.intake.IntakeClaimPort;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class AuthMySqlTest {
    static JdbcTemplate jdbc;static TransactionTemplate tx;static StudentPasswords passwords;static Secrets secrets;
    StudentSessions sessions;AuthService service;IdempotencyService idem;long student;String email;String publicId;
    @BeforeAll static void database() {
        String url=System.getenv("MP_DB_URL");if(url==null||!url.startsWith("jdbc:mysql://127.0.0.1:13306/majorpilot?"))throw new IllegalStateException("Dedicated local database required");
        var dataSource=new DriverManagerDataSource(url.replace("/majorpilot?","/majorpilot_test?"),System.getenv("MP_DB_USERNAME"),System.getenv("MP_DB_PASSWORD"));
        Flyway flyway=Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").cleanDisabled(true).load();flyway.migrate();flyway.validate();
        jdbc=new JdbcTemplate(dataSource);tx=new TransactionTemplate(new DataSourceTransactionManager(dataSource));passwords=new StudentPasswords();secrets=new Secrets("synthetic-integration-key-".repeat(3));
    }
    @BeforeEach void fixture() {
        publicId=PublicIds.next();email="p1-unit-"+publicId.toLowerCase(Locale.ROOT)+"@example.invalid";
        jdbc.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash,status,email_verified_at) VALUES(?,?,?,?,'ACTIVE',UTC_TIMESTAMP(3))",publicId,email,email,passwords.hash("synthetic original passphrase"));
        student=jdbc.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,publicId);
        sessions=new StudentSessions(jdbc);idem=new IdempotencyService(jdbc,tx,secrets,new ObjectMapper());
        service=new AuthService(jdbc,tx,mock(IntakeClaimPort.class),idem,passwords,sessions,mock(RateLimits.class),mock(AuthMailGateway.class),new SecurityEvents(jdbc,secrets),secrets,mock(ProductEvents.class));
    }
    @AfterEach void cleanup() { for(String table:List.of("mp_security_event","mp_email_token","mp_student_session","mp_consent_record"))jdbc.update("DELETE FROM "+table+" WHERE student_id=?",student);jdbc.update("DELETE FROM mp_idempotency_record WHERE owner_student_id=?",student);jdbc.update("DELETE FROM mp_student_account WHERE id=?",student); }
    @Test void sessionsAreDurableRevocableAndIdleBounded() {
        String first=sessions.issue(student),second=sessions.issue(student);assertEquals(publicId,new StudentSessions(jdbc).authenticate(first).publicId());
        sessions.revokeCurrent(first);assertThrows(ApiException.class,()->sessions.authenticate(first));assertEquals(publicId,sessions.authenticate(second).publicId());
        jdbc.update("UPDATE mp_student_session SET last_seen_at=UTC_TIMESTAMP(3)-INTERVAL 25 HOUR WHERE token_hash=?",Secrets.hash(second));assertThrows(ApiException.class,()->sessions.authenticate(second));
    }
    @Test void oneTimeResetRevokesAllSessionsWithoutAutomaticLogin() {
        String first=sessions.issue(student),second=sessions.issue(student),token=token("RESET_PASSWORD",1800);
        service.reset(new AuthDtos.Reset(token,"synthetic changed passphrase"),"fixture-source","fixture-request");
        assertThrows(ApiException.class,()->sessions.authenticate(first));assertThrows(ApiException.class,()->sessions.authenticate(second));
        String stored=jdbc.queryForObject("SELECT password_hash FROM mp_student_account WHERE id=?",String.class,student);
        assertTrue(passwords.matches("synthetic changed passphrase",stored));assertFalse(passwords.matches("synthetic original passphrase",stored));
        assertThrows(ApiException.class,()->service.reset(new AuthDtos.Reset(token,"another synthetic passphrase"),"fixture-source","fixture-request"));
    }
    @Test void tokenExpiryPurposeAndConcurrentConsumptionAreEnforced() throws Exception {
        String expired=token("VERIFY_EMAIL",-1),wrongPurpose=token("RESET_PASSWORD",1800),valid=token("VERIFY_EMAIL",1800);
        assertThrows(ApiException.class,()->service.verify(expired,"fixture-source","fixture-request"));assertThrows(ApiException.class,()->service.verify(wrongPurpose,"fixture-source","fixture-request"));
        try(var workers=Executors.newFixedThreadPool(2)) {
            var attempts=workers.invokeAll(List.<Callable<Boolean>>of(()->verify(valid),()->verify(valid)));
            int successes=0;for(var attempt:attempts)if(attempt.get())successes++;assertEquals(1,successes);
        }
    }
    @Test void failedLoginCountsCommitAndSecurityLockRevokesSessions() {
        String session=sessions.issue(student);
        for(int i=0;i<10;i++)assertEquals("AUTH_INVALID",assertThrows(ApiException.class,()->service.login(new AuthDtos.Login(email,"wrong synthetic passphrase"),"fixture-source","fixture-request")).code);
        assertEquals("LOCKED",jdbc.queryForObject("SELECT status FROM mp_student_account WHERE id=?",String.class,student));assertThrows(ApiException.class,()->sessions.authenticate(session));
        assertEquals("ACCOUNT_LOCKED",assertThrows(ApiException.class,()->service.login(new AuthDtos.Login(email,"synthetic original passphrase"),"fixture-source","fixture-request")).code);
    }
    @Test void expiredTemporaryLockAndWrongPasswordPreserveVerifiedRecovery() { expiredLockRecovery(true); }
    @Test void expiredTemporaryLockAndWrongPasswordPreservePendingRecovery() { expiredLockRecovery(false); }
    private void expiredLockRecovery(boolean verified) {
        jdbc.update("UPDATE mp_student_account SET status='LOCKED',failed_login_count=10,locked_until=UTC_TIMESTAMP(3)-INTERVAL 1 MINUTE,email_verified_at=? WHERE id=?",verified?Timestamp.from(Instant.now()):null,student);
        assertEquals("AUTH_INVALID",assertThrows(ApiException.class,()->service.login(new AuthDtos.Login(email,"wrong synthetic passphrase"),"fixture-source","fixture-request")).code);
        var state=jdbc.queryForMap("SELECT status,failed_login_count,locked_until FROM mp_student_account WHERE id=?",student);
        String expected=verified?"ACTIVE":"PENDING_VERIFICATION";
        assertEquals(expected,state.get("status"));assertEquals(1,((Number)state.get("failed_login_count")).intValue());assertNull(state.get("locked_until"));
        service.requestMail(new AuthDtos.Email(email),"RESET_PASSWORD","fixture-source","fixture-request");
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM mp_email_token WHERE student_id=? AND purpose='RESET_PASSWORD'",Integer.class,student));
        var login=service.login(new AuthDtos.Login(email,"synthetic original passphrase"),"fixture-source","fixture-request");
        assertEquals(expected,login.me().status());assertEquals(expected,sessions.authenticate(login.sessionSecret()).status());
    }
    @Test void consecutiveResearchWithdrawalIsANoOpButLaterAcceptanceCanBeWithdrawn() {
        var principal=new StudentPrincipal(student,publicId,"ACTIVE");
        service.withdrawResearch(principal,"fixture-source","fixture-request");service.withdrawResearch(principal,"fixture-source","fixture-request");
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM mp_consent_record WHERE student_id=? AND decision='WITHDRAWN'",Integer.class,student));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM mp_security_event WHERE student_id=? AND event_code='RESEARCH_WITHDRAWN'",Integer.class,student));
        jdbc.update("INSERT INTO mp_consent_record(student_id,document_type,document_version,decision) VALUES(?,'RESEARCH','v1','ACCEPTED')",student);
        service.withdrawResearch(principal,"fixture-source","fixture-request");
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM mp_consent_record WHERE student_id=? AND decision='WITHDRAWN'",Integer.class,student));
        assertEquals("ACTIVE",service.me(principal).status());
    }
    record Result(String value) {}
    @Test void idempotencyIsTransactionalAndRejectsChangedRequest() {
        var owner=new IdempotencyService.Owner(student,null,"student:"+student);String key=UUID.randomUUID().toString();AtomicInteger actions=new AtomicInteger();
        assertFalse(idem.execute(owner,"POST","/synthetic",key,Map.of("value","one"),Result.class,()->{actions.incrementAndGet();return new Result("stored");}).replayed());
        assertTrue(idem.execute(owner,"POST","/synthetic",key,Map.of("value","one"),Result.class,()->{fail("must not repeat");return null;}).replayed());
        assertEquals(1,actions.get());assertEquals("IDEMPOTENCY_KEY_REUSED",assertThrows(ApiException.class,()->idem.execute(owner,"POST","/synthetic",key,Map.of("value","changed"),Result.class,()->null)).code);
        String failing=UUID.randomUUID().toString();assertThrows(ApiException.class,()->idem.execute(owner,"POST","/rollback",failing,Map.of(),Result.class,()->{jdbc.update("INSERT INTO mp_security_event(public_id,student_id,event_code,request_id) VALUES(?,?,'ROLLBACK_FIXTURE','fixture')",PublicIds.next(),student);throw new ApiException(422,"SYNTHETIC_REJECTED");}));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM mp_security_event WHERE student_id=? AND event_code='ROLLBACK_FIXTURE'",Integer.class,student));assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM mp_idempotency_record WHERE owner_student_id=?",Integer.class,student));
    }
    @Test void concurrentIdempotencyCannotExecuteTwoActions() throws Exception {
        var owner=new IdempotencyService.Owner(student,null,"student:"+student);String key=UUID.randomUUID().toString();CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);AtomicInteger actions=new AtomicInteger();
        try(var workers=Executors.newFixedThreadPool(2)) {
            var first=workers.submit(()->idem.execute(owner,"POST","/concurrent",key,Map.of(),Result.class,()->{actions.incrementAndGet();entered.countDown();try{assertTrue(release.await(5,TimeUnit.SECONDS));}catch(InterruptedException interrupted){throw new IllegalStateException(interrupted);}return new Result("stored");}));
            assertTrue(entered.await(5,TimeUnit.SECONDS));
            assertEquals("REQUEST_IN_PROGRESS",assertThrows(ApiException.class,()->idem.execute(owner,"POST","/concurrent",key,Map.of(),Result.class,()->{actions.incrementAndGet();return new Result("bad");})).code);
            release.countDown();assertEquals("stored",first.get().data().value());assertEquals(1,actions.get());
        } finally { release.countDown(); }
    }
    private String token(String purpose,long seconds) { String value=Secrets.random();jdbc.update("INSERT INTO mp_email_token(student_id,purpose,token_hash,expires_at) VALUES(?,?,?,?)",student,purpose,Secrets.hash(value),Timestamp.from(Instant.now().plusSeconds(seconds)));return value; }
    private boolean verify(String value) { try{service.verify(value,"fixture-source","fixture-request");return true;}catch(ApiException invalid){assertEquals("EMAIL_TOKEN_INVALID",invalid.code);return false;} }
}
