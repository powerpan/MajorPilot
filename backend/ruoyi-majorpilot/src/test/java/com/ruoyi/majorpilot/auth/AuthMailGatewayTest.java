package com.ruoyi.majorpilot.auth;

import com.ruoyi.majorpilot.shared.Secrets;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthMailGatewayTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);final JavaMailSender sender=mock(JavaMailSender.class);
    final AuthTestTransactions transactions=new AuthTestTransactions();
    final Map<String,Object> account=new HashMap<>(),tokenRow=new HashMap<>();final String token=Secrets.random();
    AuthMailGateway gateway;boolean tokenAvailable=true;long expectedStudent=7;
    @BeforeEach void setup(){
        account.put("status","ACTIVE");account.put("email_normalized","old@example.invalid");tokenRow.put("target_email_normalized","new@example.invalid");
        when(db.queryForList(anyString(),any(Object[].class))).thenAnswer(call->{String sql=call.getArgument(0);Object[] args=(Object[])call.getRawArguments()[1];assertTrue(sql.endsWith("FOR UPDATE"));assertEquals(expectedStudent,args[0]);
            if(sql.startsWith("SELECT status"))return account.isEmpty()?List.of():List.of(account);
            assertEquals(Secrets.hash(token),args[1]);assertTrue(sql.contains("used_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3)"));return tokenAvailable?List.of(tokenRow):List.of();});
        gateway=new AuthMailGateway(sender,db,transactions.template());
    }
    @AfterEach void stop(){gateway.shutdown();}
    @Test void changeEmailUsesTokenBoundDestinationAndFragmentRouteInsideStudentLock(){
        doAnswer(call->{assertEquals(0,transactions.commits);assertEquals(1,transactions.begins);return null;}).when(sender).send(any(SimpleMailMessage.class));
        assertTrue(gateway.send(7,"CHANGE_EMAIL",token));var sent=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(sender).send(sent.capture());
        assertArrayEquals(new String[]{"new@example.invalid"},sent.getValue().getTo());assertTrue(sent.getValue().getText().contains("/change-email#token="+token));assertEquals(1,transactions.commits);
    }
    @Test void deletedMissingAndRevokedTokensNeverSend(){
        account.put("status","DELETION_PENDING");assertFalse(gateway.send(7,"CHANGE_EMAIL",token));account.put("status","DELETED");assertFalse(gateway.send(7,"VERIFY_EMAIL",token));
        account.put("status","ACTIVE");tokenAvailable=false;assertFalse(gateway.send(7,"RESET_PASSWORD",token));account.clear();assertFalse(gateway.send(7,"VERIFY_EMAIL",token));verifyNoInteractions(sender);
    }
    @Test void usedOrExpiredTokenAndWrongPurposeAreFailClosed(){
        tokenAvailable=false;assertFalse(gateway.send(7,"VERIFY_EMAIL",token));assertFalse(gateway.send(7,"arbitrary",token));assertFalse(gateway.send(7,null,token));assertFalse(gateway.send(7,"VERIFY_EMAIL","bad"));verifyNoInteractions(sender);
    }
    @Test void verifyAndResetDestinationComesFromCurrentAccountNotQueueCaller(){
        assertTrue(gateway.send(7,"VERIFY_EMAIL",token));assertTrue(gateway.send(7,"RESET_PASSWORD",token));
        var sent=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(sender,times(2)).send(sent.capture());assertTrue(sent.getAllValues().stream().allMatch(m->Arrays.equals(new String[]{"old@example.invalid"},m.getTo())));
        assertTrue(sent.getAllValues().get(0).getText().contains("/verify-email#token="));assertTrue(sent.getAllValues().get(1).getText().contains("/reset-password#token="));
    }
    @Test void unavailableTransportReturnsSafeFailureWithoutThrowingOrLoggingPayload(){
        doThrow(new IllegalStateException("synthetic provider failure")).when(sender).send(any(SimpleMailMessage.class));assertFalse(gateway.send(7,"VERIFY_EMAIL",token));assertEquals(1,transactions.rollbacks);
    }
    @Test void queuedSendRechecksDeletionAtDispatchRatherThanTrustingEnqueueState() throws Exception {
        CountDownLatch checked=new CountDownLatch(1),release=new CountDownLatch(1);
        when(db.queryForList(startsWith("SELECT status"),any(Object[].class))).thenAnswer(call->{checked.countDown();assertTrue(release.await(3,TimeUnit.SECONDS));return List.of(Map.of("status","DELETION_PENDING"));});
        gateway.sendAsync(7,"CHANGE_EMAIL",token);assertTrue(checked.await(3,TimeUnit.SECONDS));release.countDown();
        assertTrue(transactions.finished.await(3,TimeUnit.SECONDS));
        assertEquals(1,transactions.commits+transactions.rollbacks);verifyNoInteractions(sender);
    }
}
