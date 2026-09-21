package com.ruoyi.majorpilot.auth;

import com.ruoyi.majorpilot.privacy.PrivacyDtos;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in only: real row locks, uniqueness and commit/rollback in the dedicated test schema. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class AccountSettingsMySqlTest {
    static final String CURRENT="synthetic original passphrase",NEW="synthetic changed passphrase";
    static JdbcTemplate db;static TransactionTemplate tx;static StudentPasswords passwords;
    static final Secrets SECRETS=new Secrets("synthetic-settings-integration-".repeat(3));
    final List<Long> ownedStudents=new ArrayList<>();
    StudentPrincipal student;String originalEmail;StudentSessions sessions;AccountSettingsService service;
    AuthMailGateway mail;RateLimits limits;
    @BeforeAll static void database(){
        String url=System.getenv("MP_DB_URL");if(url==null||!url.startsWith("jdbc:mysql://127.0.0.1:13306/majorpilot?"))throw new IllegalStateException("Dedicated local test database required");
        var ds=new DriverManagerDataSource(url.replace("/majorpilot?","/majorpilot_test?"),System.getenv("MP_DB_USERNAME"),System.getenv("MP_DB_PASSWORD"));
        db=new JdbcTemplate(ds);assertEquals("majorpilot_test",db.queryForObject("SELECT DATABASE()",String.class));
        var flyway=Flyway.configure().dataSource(ds).locations("classpath:db/migration").cleanDisabled(true).load();flyway.migrate();flyway.validate();
        tx=new TransactionTemplate(new DataSourceTransactionManager(ds));passwords=new StudentPasswords();
    }
    @BeforeEach void fixture(){
        originalEmail="p7-settings-"+PublicIds.next().toLowerCase(Locale.ROOT)+"@example.invalid";student=account(originalEmail);
        sessions=new StudentSessions(db);mail=mock(AuthMailGateway.class);limits=mock(RateLimits.class);
        service=new AccountSettingsService(db,tx,passwords,sessions,limits,mail,new SecurityEvents(db,SECRETS),SECRETS,new ProductEvents(db,new ObjectMapper()));
    }
    @AfterEach void cleanup(){
        for(long id:ownedStudents){for(String table:List.of("mp_product_event","mp_security_event","mp_email_token","mp_student_session"))db.update("DELETE FROM "+table+" WHERE student_id=?",id);db.update("DELETE FROM mp_student_account WHERE id=?",id);}
    }
    @Test void newRequestRevokesEarlierTokenAndStoresOnlyHashWithTarget(){
        String first=requestEmail(freshEmail()),nextEmail=freshEmail(),second=requestEmail(nextEmail);
        assertNotEquals(first,second);assertEquals(1L,count("SELECT COUNT(*) FROM mp_email_token WHERE student_id=? AND purpose='CHANGE_EMAIL' AND revoked_at IS NULL",student.internalId()));
        var row=db.queryForMap("SELECT * FROM mp_email_token WHERE token_hash=?",Secrets.hash(second));
        assertEquals(nextEmail,row.get("target_email_normalized"));assertFalse(row.values().contains(second));
        assertNotNull(db.queryForObject("SELECT revoked_at FROM mp_email_token WHERE token_hash=?",Timestamp.class,Secrets.hash(first)));
    }
    @Test void unavailableDestinationStillAcceptsAndRevokesPreviousRequest(){
        String first=requestEmail(freshEmail());var other=account(freshEmail());String occupied=db.queryForObject("SELECT email_normalized FROM mp_student_account WHERE id=?",String.class,other.internalId());
        clearInvocations(mail);assertDoesNotThrow(()->service.requestEmail(student,new PrivacyDtos.EmailChange(CURRENT,occupied),"fixture","fixture"));
        assertNotNull(db.queryForObject("SELECT revoked_at FROM mp_email_token WHERE token_hash=?",Timestamp.class,Secrets.hash(first)));
        verifyNoInteractions(mail);assertEquals(originalEmail,currentEmail());
    }
    @Test void pendingConfirmationVerifiesNewEmailAndRevokesEverySessionAndOtherToken(){
        db.update("UPDATE mp_student_account SET status='PENDING_VERIFICATION',email_verified_at=NULL WHERE id=?",student.internalId());
        String one=sessions.issue(student.internalId()),two=sessions.issue(student.internalId());token(student,"RESET_PASSWORD",1800);token(student,"VERIFY_EMAIL",1800);
        String next=freshEmail(),change=requestEmail(next);service.confirmEmail(student,new PrivacyDtos.EmailConfirm(change),"fixture","fixture");
        assertEquals(next,currentEmail());assertEquals("ACTIVE",db.queryForObject("SELECT status FROM mp_student_account WHERE id=?",String.class,student.internalId()));
        assertNotNull(db.queryForObject("SELECT email_verified_at FROM mp_student_account WHERE id=?",Timestamp.class,student.internalId()));
        assertThrows(ApiException.class,()->sessions.authenticate(one));assertThrows(ApiException.class,()->sessions.authenticate(two));
        assertEquals(0L,count("SELECT COUNT(*) FROM mp_email_token WHERE student_id=? AND used_at IS NULL AND revoked_at IS NULL",student.internalId()));
        assertEquals(1L,count("SELECT COUNT(*) FROM mp_email_token WHERE student_id=? AND used_at IS NOT NULL",student.internalId()));
        assertTokenError(student,change);
    }
    @Test void concurrentConfirmationConsumesOnlyOnce()throws Exception{
        String token=requestEmail(freshEmail());try(var pool=Executors.newFixedThreadPool(2)){
            var attempts=pool.invokeAll(List.<Callable<Boolean>>of(()->confirm(token),()->confirm(token)));
            assertEquals(1,attempts.stream().filter(f->{try{return f.get();}catch(Exception e){throw new AssertionError(e);}}).count());
        }
        assertEquals(1L,count("SELECT COUNT(*) FROM mp_security_event WHERE student_id=? AND event_code='EMAIL_CHANGE_COMPLETED'",student.internalId()));
    }
    @Test void changingAddressDoesNotRewriteOriginalVerificationAnchor(){
        Instant original=Instant.parse("2026-01-01T00:00:00Z");db.update("UPDATE mp_student_account SET email_verified_at=? WHERE id=?",Timestamp.from(original),student.internalId());
        service.confirmEmail(student,new PrivacyDtos.EmailConfirm(requestEmail(freshEmail())),"fixture","fixture");
        assertEquals(original,db.queryForObject("SELECT email_verified_at FROM mp_student_account WHERE id=?",Timestamp.class,student.internalId()).toInstant());
        assertEquals(0L,count("SELECT COUNT(*) FROM mp_product_event WHERE student_id=? AND event_name='student.email.verified'",student.internalId()));
    }
    @Test void otherOwnerExpiredUsedAndRevokedTokensCannotChangeAnAccount(){
        String valid=requestEmail(freshEmail());var other=account(freshEmail());assertTokenError(other,valid);
        db.update("UPDATE mp_email_token SET expires_at=UTC_TIMESTAMP(3) WHERE token_hash=?",Secrets.hash(valid));assertTokenError(student,valid);
        String used=requestEmail(freshEmail());db.update("UPDATE mp_email_token SET used_at=UTC_TIMESTAMP(3) WHERE token_hash=?",Secrets.hash(used));assertTokenError(student,used);
        String revoked=requestEmail(freshEmail());db.update("UPDATE mp_email_token SET revoked_at=UTC_TIMESTAMP(3) WHERE token_hash=?",Secrets.hash(revoked));assertTokenError(student,revoked);
        assertEquals(originalEmail,currentEmail());
    }
    @Test void destinationClaimedAfterRequestCannotReplaceOtherIdentityOrRevokeOwnSessions(){
        String target=freshEmail(),change=requestEmail(target);account(target);String session=sessions.issue(student.internalId());
        assertTokenError(student,change);assertEquals(originalEmail,currentEmail());assertEquals(student.publicId(),sessions.authenticate(session).publicId());
        assertEquals(0L,count("SELECT COUNT(*) FROM mp_email_token WHERE token_hash=? AND used_at IS NOT NULL",Secrets.hash(change)));
    }
    @Test void failedCurrentPasswordAuditCommitsWhileTokensAndPasswordRemainUntouched(){
        for(int i=0;i<3;i++)assertEquals("CURRENT_PASSWORD_INVALID",assertThrows(ApiException.class,()->service.changePassword(student,new PrivacyDtos.PasswordChange("wrong",NEW),"fixture","fixture")).code);
        assertEquals(3L,count("SELECT COUNT(*) FROM mp_security_event WHERE student_id=? AND event_code='ACCOUNT_SETTINGS_PASSWORD_REJECTED'",student.internalId()));
        verify(limits,times(3)).require(eq("account-settings-student"),eq("student:"+student.internalId()),eq(10),any());
        assertTrue(passwords.matches(CURRENT,db.queryForObject("SELECT password_hash FROM mp_student_account WHERE id=?",String.class,student.internalId())));
        assertEquals(0L,count("SELECT COUNT(*) FROM mp_email_token WHERE student_id=?",student.internalId()));
    }
    @Test void passwordChangeRevokesAllTokensAndSessionsAndKeepsPendingStatus(){
        db.update("UPDATE mp_student_account SET status='PENDING_VERIFICATION',email_verified_at=NULL WHERE id=?",student.internalId());
        String one=sessions.issue(student.internalId()),two=sessions.issue(student.internalId());token(student,"VERIFY_EMAIL",1800);token(student,"RESET_PASSWORD",1800);requestEmail(freshEmail());
        service.changePassword(student,new PrivacyDtos.PasswordChange(CURRENT,NEW),"fixture","fixture");
        assertTrue(passwords.matches(NEW,db.queryForObject("SELECT password_hash FROM mp_student_account WHERE id=?",String.class,student.internalId())));
        assertEquals("PENDING_VERIFICATION",db.queryForObject("SELECT status FROM mp_student_account WHERE id=?",String.class,student.internalId()));
        assertThrows(ApiException.class,()->sessions.authenticate(one));assertThrows(ApiException.class,()->sessions.authenticate(two));
        assertEquals(0L,count("SELECT COUNT(*) FROM mp_email_token WHERE student_id=? AND revoked_at IS NULL",student.internalId()));
    }
    @Test void lockedAndDeletionPendingRejectAllSettingsAndUndeliveredMail(){
        String change=requestEmail(freshEmail());for(String state:List.of("LOCKED","DELETION_PENDING")){
            db.update("UPDATE mp_student_account SET status=? WHERE id=?",state,student.internalId());
            assertThrows(ApiException.class,()->service.changePassword(student,new PrivacyDtos.PasswordChange(CURRENT,NEW),"fixture","fixture"));
            assertThrows(ApiException.class,()->service.requestEmail(student,new PrivacyDtos.EmailChange(CURRENT,freshEmail()),"fixture","fixture"));
            assertThrows(ApiException.class,()->service.confirmEmail(student,new PrivacyDtos.EmailConfirm(change),"fixture","fixture"));
        }
        var sender=mock(JavaMailSender.class);var guarded=new AuthMailGateway(sender,db,tx);try{assertFalse(guarded.send(student.internalId(),"CHANGE_EMAIL",change));verifyNoInteractions(sender);}finally{guarded.shutdown();}
        assertEquals(originalEmail,currentEmail());
    }
    @Test void smtpDispatchAndDeletionConfirmationSerializeOnTheSameStudentLock()throws Exception{
        String change=requestEmail(freshEmail());var sender=mock(JavaMailSender.class);var guarded=new AuthMailGateway(sender,db,tx);
        CountDownLatch sending=new CountDownLatch(1),release=new CountDownLatch(1),deleting=new CountDownLatch(1);
        doAnswer(call->{sending.countDown();assertTrue(release.await(4,TimeUnit.SECONDS));return null;}).when(sender).send(any(SimpleMailMessage.class));
        try(var pool=Executors.newFixedThreadPool(2)){
            try{
                var sent=pool.submit(()->guarded.send(student.internalId(),"CHANGE_EMAIL",change));assertTrue(sending.await(3,TimeUnit.SECONDS));
                var deleted=pool.submit(()->{deleting.countDown();tx.executeWithoutResult(status->{db.queryForObject("SELECT id FROM mp_student_account WHERE id=? FOR UPDATE",Long.class,student.internalId());db.update("UPDATE mp_student_account SET status='DELETION_PENDING' WHERE id=?",student.internalId());});});
                assertTrue(deleting.await(3,TimeUnit.SECONDS));assertThrows(TimeoutException.class,()->deleted.get(100,TimeUnit.MILLISECONDS));
                release.countDown();assertTrue(sent.get(3,TimeUnit.SECONDS));deleted.get(3,TimeUnit.SECONDS);
                assertFalse(guarded.send(student.internalId(),"CHANGE_EMAIL",change));verify(sender,times(1)).send(any(SimpleMailMessage.class));
            }finally{release.countDown();}
        }finally{guarded.shutdown();}
    }
    private StudentPrincipal account(String email){String id=PublicIds.next();db.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash,status,email_verified_at,analytics_exclusion_code) VALUES(?,?,?,?,'ACTIVE',UTC_TIMESTAMP(3),'TEST')",id,email,email,passwords.hash(CURRENT));long internal=db.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,id);ownedStudents.add(internal);return new StudentPrincipal(internal,id,"ACTIVE");}
    private String freshEmail(){return "p7-target-"+PublicIds.next().toLowerCase(Locale.ROOT)+"@example.invalid";}
    private String currentEmail(){return db.queryForObject("SELECT email_normalized FROM mp_student_account WHERE id=?",String.class,student.internalId());}
    private String requestEmail(String email){clearInvocations(mail);service.requestEmail(student,new PrivacyDtos.EmailChange(CURRENT,email),"fixture","fixture");var token=org.mockito.ArgumentCaptor.forClass(String.class);verify(mail).sendAsync(eq(student.internalId()),eq("CHANGE_EMAIL"),token.capture());return token.getValue();}
    private String token(StudentPrincipal owner,String purpose,int seconds){String value=Secrets.random();db.update("INSERT INTO mp_email_token(student_id,purpose,token_hash,expires_at) VALUES(?,?,?,?)",owner.internalId(),purpose,Secrets.hash(value),Timestamp.from(Instant.now().plusSeconds(seconds)));return value;}
    private long count(String sql,Object...args){return db.queryForObject(sql,Long.class,args);}
    private void assertTokenError(StudentPrincipal owner,String token){assertEquals("EMAIL_TOKEN_INVALID",assertThrows(ApiException.class,()->service.confirmEmail(owner,new PrivacyDtos.EmailConfirm(token),"fixture","fixture")).code);}
    private boolean confirm(String token){try{service.confirmEmail(student,new PrivacyDtos.EmailConfirm(token),"fixture","fixture");return true;}catch(ApiException error){assertEquals("EMAIL_TOKEN_INVALID",error.code);return false;}}
}
