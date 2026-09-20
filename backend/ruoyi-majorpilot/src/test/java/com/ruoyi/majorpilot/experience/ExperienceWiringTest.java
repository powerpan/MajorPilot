package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.content.TaskContent;
import com.ruoyi.majorpilot.content.TaskContentProvider;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.IdempotencyService;
import com.ruoyi.majorpilot.shared.StudentPrincipal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.dao.annotation.PersistenceExceptionTranslationPostProcessor;
import org.springframework.dao.support.PersistenceExceptionTranslator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ExperienceWiringTest {
    private AnnotationConfigApplicationContext context(boolean demos) {
        var context=new AnnotationConfigApplicationContext();
        context.setEnvironment(new MockEnvironment().withProperty("MP_P2_DEMO_ENABLED",Boolean.toString(demos)));
        context.getEnvironment().setActiveProfiles("local");
        context.registerBean(PersistenceExceptionTranslationPostProcessor.class,()->{
            var processor=new PersistenceExceptionTranslationPostProcessor();processor.setProxyTargetClass(true);return processor;
        });
        context.registerBean(PersistenceExceptionTranslator.class,()->failure->null);
        var jdbc=mock(JdbcTemplate.class);
        when(jdbc.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",1L)).thenReturn(List.of(Map.of("status","ACTIVE")));
        context.registerBean(JdbcTemplate.class,()->jdbc);
        var mapper=new ObjectMapper();context.registerBean(ObjectMapper.class,()->mapper);
        var manager=mock(PlatformTransactionManager.class);when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        context.registerBean(TransactionTemplate.class,()->new TransactionTemplate(manager));
        context.registerBean(IdempotencyService.class,()->mock(IdempotencyService.class));
        var provider=mock(TaskContentProvider.class);
        for(String key:List.of("DEMO_TABLE","DEMO_COMPARE"))when(provider.currentDemo(key)).thenReturn(new TaskContent.Version(1,"00000000000000000000000001","DEMO",null,key,"1.0.0","synthetic-sha",mapper.createObjectNode().put("title",key)));
        context.registerBean(TaskContentProvider.class,()->provider);
        context.registerBean(HintProvider.class,()->mock(HintProvider.class));
        context.registerBean(RateLimits.class,()->mock(RateLimits.class));
        context.register(RunStore.class,RunService.class,HintService.class);
        context.refresh();assertTrue(AopUtils.isCglibProxy(context.getBean(RunStore.class)),"The production repository proxy boundary must be exercised");
        return context;
    }
    @Test void enabledDemoListingUsesTheRepositoryTargetInsteadOfProxyShellFields() {
        try(var context=context(true)) {
            var result=context.getBean(RunService.class).demos(new StudentPrincipal(1,"00000000000000000000000001","ACTIVE"));
            assertEquals(List.of("DEMO_TABLE","DEMO_COMPARE"),result.stream().map(row->row.get("demoKey")).toList());
            verify(context.getBean(JdbcTemplate.class)).queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",1L);
        }
    }
    @Test void scheduledRecoveryExecutesItsDatabaseQueryThroughTheRepositoryProxy() {
        try(var context=context(true)) {
            assertDoesNotThrow(()->context.getBean(HintService.class).recoverPending());
            verify(context.getBean(JdbcTemplate.class)).queryForList(startsWith("SELECT h.public_id,r.id AS run_id"));
            verifyNoInteractions(context.getBean(HintProvider.class));
        }
    }
}
