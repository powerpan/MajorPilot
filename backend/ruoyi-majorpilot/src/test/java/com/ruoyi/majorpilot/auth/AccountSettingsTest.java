package com.ruoyi.majorpilot.auth;

import com.ruoyi.majorpilot.privacy.PrivacyDtos;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.http.ResponseEntity;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountSettingsTest {
    static final String CURRENT="synthetic original passphrase",NEW="synthetic changed passphrase";
    final StudentPrincipal student=new StudentPrincipal(7,PublicIds.next(),"ACTIVE");
    final JdbcTemplate db=mock(JdbcTemplate.class);final StudentPasswords passwords=mock(StudentPasswords.class);
    final StudentSessions sessions=mock(StudentSessions.class);final RateLimits limits=mock(RateLimits.class);
    final AuthMailGateway mail=mock(AuthMailGateway.class);final SecurityEvents audit=mock(SecurityEvents.class);
    final ProductEvents events=mock(ProductEvents.class);
    final AuthTestTransactions transactions=new AuthTestTransactions();
    final Map<String,Object> account=new HashMap<>(),tokenRow=new HashMap<>();
    final List<Object[]> writes=new ArrayList<>();boolean occupied;
    AccountSettingsService service;
    @BeforeEach void setup() {
        account.put("public_id",student.publicId());account.put("status","ACTIVE");account.put("password_hash","old-hash");account.put("email_verified_at",java.sql.Timestamp.from(java.time.Instant.now()));account.put("created_at",java.sql.Timestamp.from(java.time.Instant.now()));
        tokenRow.put("id",9L);tokenRow.put("target_email_normalized","new@example.invalid");tokenRow.put("target_email_display","New@example.invalid");
        when(passwords.matches(CURRENT,"old-hash")).thenReturn(true);when(passwords.hash(NEW)).thenReturn("new-hash");
        when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(call->{
            String sql=call.getArgument(0);Object[] args=(Object[])call.getRawArguments()[1];
            if(sql.startsWith("SELECT public_id,status,password_hash")){assertTrue(sql.endsWith("FOR UPDATE"));assertEquals(student.internalId(),args[0]);return List.of(account);}
            if(sql.startsWith("SELECT id FROM mp_student_account"))return occupied?List.of(Map.of("id",8L)):List.of();
            if(sql.startsWith("SELECT id,target_email_normalized")){assertTrue(sql.contains("student_id=?"));assertEquals(student.internalId(),args[0]);return tokenRow.isEmpty()?List.of():List.of(tokenRow);}
            throw new AssertionError("Unexpected query shape");
        });
        when(db.update(anyString(),any(Object[].class))).thenAnswer(call->{writes.add(call.getRawArguments().clone());return 1;});
        service=new AccountSettingsService(db,transactions.template(),passwords,sessions,limits,mail,audit,new Secrets("synthetic-secret-".repeat(4)),events);
    }
    @Test void issueUsesNormalizedTargetHashedTokenAndSendsOnlyAfterCommit() {
        doAnswer(call->{assertEquals(1,transactions.commits);return null;}).when(mail).sendAsync(eq(7L),eq("CHANGE_EMAIL"),anyString());
        service.requestEmail(student,new PrivacyDtos.EmailChange(CURRENT," New@example.invalid "),"ip","req");
        var token=org.mockito.ArgumentCaptor.forClass(String.class);verify(mail).sendAsync(eq(7L),eq("CHANGE_EMAIL"),token.capture());
        assertTrue(token.getValue().matches("[A-Za-z0-9_-]{43}"));
        var write=writes.stream().filter(w->w[0].toString().startsWith("INSERT INTO mp_email_token")).findFirst().orElseThrow();
        Object[] args=(Object[])write[1];assertEquals(6,args.length);assertEquals(Secrets.hash(token.getValue()),args[1]);
        assertEquals("new@example.invalid",args[2]);assertEquals("New@example.invalid",args[3]);
        assertFalse(Arrays.asList(args).contains(token.getValue()));verify(audit).record(7L,"EMAIL_CHANGE_REQUESTED","ip","req");
    }
    @Test void unavailableAndSameEmailRemainAcceptedButInvalidatePredecessor() {
        occupied=true;assertDoesNotThrow(()->service.requestEmail(student,new PrivacyDtos.EmailChange(CURRENT,"taken@example.invalid"),"ip","req"));
        assertEquals(1,writes.size());assertTrue(writes.getFirst()[0].toString().contains("revoked_at"));
        verifyNoInteractions(mail);assertEquals(1,transactions.commits);
    }
    @Test void badCurrentPasswordCommitsOnlySafeAuditAndRateLimitIsOutsideRollback() {
        doAnswer(call->{assertEquals(0,transactions.begins);return null;}).when(limits).require(anyString(),anyString(),anyInt(),any());
        ApiException error=assertThrows(ApiException.class,()->service.requestEmail(student,new PrivacyDtos.EmailChange("wrong", "new@example.invalid"),"ip","req"));
        assertEquals(422,error.status);assertEquals("CURRENT_PASSWORD_INVALID",error.code);
        assertEquals(1,transactions.commits);assertEquals(0,transactions.rollbacks);assertTrue(writes.isEmpty());
        verify(audit).record(7L,"ACCOUNT_SETTINGS_PASSWORD_REJECTED","ip","req");verifyNoInteractions(mail);
    }
    @Test void pendingAccountCanChangePasswordAndRevokesAllPurposesAndSessions() {
        account.put("status","PENDING_VERIFICATION");service.changePassword(student,new PrivacyDtos.PasswordChange(CURRENT,NEW),"ip","req");
        verify(sessions).revokeAll(7L,"PASSWORD_CHANGED");
        assertTrue(writes.stream().anyMatch(w->w[0].toString().contains("password_hash=?")&&Arrays.asList((Object[])w[1]).contains("new-hash")));
        assertTrue(writes.stream().anyMatch(w->w[0].toString().startsWith("UPDATE mp_email_token")&&!w[0].toString().contains("purpose=?")));
        verify(audit).record(7L,"PASSWORD_CHANGE_COMPLETED","ip","req");
    }
    @Test void allLockedDeletionAndWrongPrincipalStatesFailBeforePasswordOrTokenMutation() {
        for(String status:List.of("LOCKED","DELETION_PENDING","DELETED")) {
            account.put("status",status);assertEquals(status.equals("LOCKED")?"ACCOUNT_LOCKED":"SESSION_EXPIRED",assertThrows(ApiException.class,()->service.changePassword(student,new PrivacyDtos.PasswordChange(CURRENT,NEW),"ip","req")).code);
        }
        account.put("status","ACTIVE");account.put("public_id",PublicIds.next());assertThrows(ApiException.class,()->service.confirmEmail(student,new PrivacyDtos.EmailConfirm(Secrets.random()),"ip","req"));
        assertTrue(writes.isEmpty());verify(passwords,never()).matches(anyString(),anyString());verifyNoInteractions(sessions,mail);
    }
    @Test void confirmUsesSessionOwnerMarksTokenUsedAndRevokesEverySessionAndToken() {
        service.confirmEmail(student,new PrivacyDtos.EmailConfirm(Secrets.random()),"ip","req");
        verify(sessions).revokeAll(7L,"EMAIL_CHANGED");assertEquals(1,transactions.commits);
        assertTrue(writes.stream().anyMatch(w->w[0].toString().contains("email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP(3)),status='ACTIVE'")));
        assertTrue(writes.stream().anyMatch(w->w[0].toString().contains("SET used_at=")));
        verify(audit).record(7L,"EMAIL_CHANGE_COMPLETED","ip","req");
    }
    @Test void firstVerificationThroughEmailChangeRecordsOnlyExistingSafeDomainEvent() {
        account.put("email_verified_at",null);account.put("status","PENDING_VERIFICATION");
        service.confirmEmail(student,new PrivacyDtos.EmailConfirm(Secrets.random()),"ip","req");
        verify(events).record(7L,null,null,"student.email.verified",Map.of("elapsedBucket","UNDER_1_HOUR"));
    }
    @Test void expiredUsedOtherOwnerAndConflictingTargetsShareSafeTokenError() {
        tokenRow.clear();assertTokenError();tokenRow.put("id",9L);tokenRow.put("target_email_normalized","new@example.invalid");tokenRow.put("target_email_display","mismatch@example.invalid");assertTokenError();
        tokenRow.put("target_email_display","new@example.invalid");occupied=true;assertTokenError();
        assertTrue(writes.isEmpty());verifyNoInteractions(sessions);
    }
    @Test void duplicateEmailRaceRollsBackAndReturnsSameSafeError() {
        when(db.update(startsWith("UPDATE mp_student_account SET email_normalized"),any(Object[].class))).thenThrow(new DuplicateKeyException("synthetic"));
        assertTokenError();assertEquals(1,transactions.rollbacks);verifyNoInteractions(sessions);
    }
    @Test void invalidInputsCannotHashPasswordOrIssueEmail() {
        assertEquals("PASSWORD_POLICY_INVALID",assertThrows(ApiException.class,()->service.changePassword(student,new PrivacyDtos.PasswordChange(CURRENT,"short"),"ip","req")).code);
        assertEquals("VALIDATION_ERROR",assertThrows(ApiException.class,()->service.requestEmail(student,new PrivacyDtos.EmailChange(CURRENT,"invalid"),"ip","req")).code);
        assertEquals("EMAIL_TOKEN_INVALID",assertThrows(ApiException.class,()->service.confirmEmail(student,new PrivacyDtos.EmailConfirm("invalid"),"ip","req")).code);
        assertEquals(0,transactions.begins);verify(passwords,never()).hash(anyString());assertTrue(writes.isEmpty());
    }
    @Test void controllerUses202AndClearsBothCookiesOnlyAfterSuccess() {
        var target=mock(AccountSettingsService.class);var controller=new AccountSettingsController(target);var req=new MockHttpServletRequest();req.setAttribute("mp.student",student);
        var accepted=(ResponseEntity<?>)controller.email(new PrivacyDtos.EmailChange(CURRENT,"new@example.invalid"),req);assertEquals(202,accepted.getStatusCode().value());
        var res=new MockHttpServletResponse();controller.password(new PrivacyDtos.PasswordChange(CURRENT,NEW),req,res);assertEquals(2,res.getHeaders("Set-Cookie").size());
        assertTrue(res.getHeaders("Set-Cookie").stream().allMatch(c->c.contains("Max-Age=0")));
        doThrow(new ApiException(422,"EMAIL_TOKEN_INVALID")).when(target).confirmEmail(any(),any(),any(),any());
        var rejected=new MockHttpServletResponse();assertThrows(ApiException.class,()->controller.confirm(new PrivacyDtos.EmailConfirm("bad"),req,rejected));assertTrue(rejected.getHeaders("Set-Cookie").isEmpty());
    }
    @Test void realSpringConstructorsWireMailAndSettingsWithoutSyntheticFallback() {
        try(var context=new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles("local");
            context.registerBean(JdbcTemplate.class,()->db);context.registerBean(org.springframework.transaction.support.TransactionTemplate.class,transactions::template);
            context.registerBean(StudentPasswords.class,()->passwords);context.registerBean(StudentSessions.class,()->sessions);
            context.registerBean(RateLimits.class,()->limits);context.registerBean(SecurityEvents.class,()->audit);context.registerBean(ProductEvents.class,()->events);
            context.registerBean(Secrets.class,()->new Secrets("synthetic-secret-".repeat(4)));
            context.registerBean(org.springframework.mail.javamail.JavaMailSender.class,()->mock(org.springframework.mail.javamail.JavaMailSender.class));
            context.register(AuthMailGateway.class,AccountSettingsService.class,AccountSettingsController.class);
            assertDoesNotThrow(context::refresh);assertNotNull(context.getBean(AccountSettingsController.class));
        }
    }
    private void assertTokenError(){assertEquals("EMAIL_TOKEN_INVALID",assertThrows(ApiException.class,()->service.confirmEmail(student,new PrivacyDtos.EmailConfirm(Secrets.random()),"ip","req")).code);}
}
