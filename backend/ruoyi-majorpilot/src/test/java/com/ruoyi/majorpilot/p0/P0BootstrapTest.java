package com.ruoyi.majorpilot.p0;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import com.ruoyi.system.service.ISysConfigService;
import static org.mockito.Mockito.*;

class P0BootstrapTest {
    @Test void localInitializationNeverOverwritesManagedOperatorPasswords(){
        assertTrue(P0Bootstrap.shouldRotate(false,false,P0Bootstrap.UPSTREAM_PASSWORD));
        assertFalse(P0Bootstrap.shouldRotate(false,false,"operator-managed-hash"));
        assertFalse(P0Bootstrap.shouldRotate(false,true,P0Bootstrap.UPSTREAM_PASSWORD));
        assertTrue(P0Bootstrap.shouldRotate(true,true,"explicit-probe-password"));
    }
    @Test void localRandomAdminPasswordMustRespectUpstreamMaximum() {
        assertDoesNotThrow(()->P0Bootstrap.validateAdminPassword("a".repeat(16)));
        assertDoesNotThrow(()->P0Bootstrap.validateAdminPassword("a".repeat(20)));
        assertThrows(IllegalArgumentException.class,()->P0Bootstrap.validateAdminPassword("a".repeat(15)));
        assertThrows(IllegalArgumentException.class,()->P0Bootstrap.validateAdminPassword("a".repeat(21)));
        assertThrows(IllegalArgumentException.class,()->P0Bootstrap.validateAdminPassword(null));
    }
    @Test void repeatedLocalStartupDoesNotResetManagedPasswordOrDisableNewOperators(){
        var db=mock(JdbcTemplate.class);var tx=mock(TransactionTemplate.class);var config=mock(ISysConfigService.class);var env=new MockEnvironment();env.setActiveProfiles("local");
        when(db.queryForObject("SELECT password FROM sys_user WHERE user_id=1 FOR UPDATE",String.class)).thenReturn("operator-managed-password");
        when(db.queryForObject("SELECT COUNT(*) FROM sys_config WHERE config_key=?",Integer.class,P0Bootstrap.INITIALIZED)).thenReturn(1);
        doAnswer(invocation->{java.util.function.Consumer<TransactionStatus> action=invocation.getArgument(0);action.accept(mock(TransactionStatus.class));return null;}).when(tx).executeWithoutResult(any());
        var bootstrap=new P0Bootstrap(db,config,"synthetic-pass-12345",tx,env);bootstrap.run(null);bootstrap.run(null);
        for(var invocation:mockingDetails(db).getInvocations())if(invocation.getMethod().getName().equals("update")){String sql=(String)invocation.getArgument(0);assertFalse(sql.contains("SET password="));assertFalse(sql.contains("user_id<>1"));if(sql.startsWith("UPDATE sys_user SET status"))assertEquals("UPDATE sys_user SET status='1' WHERE user_id=2 AND user_name='ry'",sql);}
        verify(config,times(2)).resetConfigCache();
    }
}
