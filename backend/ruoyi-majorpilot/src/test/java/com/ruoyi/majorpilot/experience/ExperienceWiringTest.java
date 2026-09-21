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
        context.registerBean(com.ruoyi.majorpilot.classifier.ClassifierEngine.class,()->mock(com.ruoyi.majorpilot.classifier.ClassifierEngine.class));
        context.registerBean(com.ruoyi.majorpilot.datascience.DsStatsEngine.class,()->mock(com.ruoyi.majorpilot.datascience.DsStatsEngine.class));
        context.registerBean(com.ruoyi.majorpilot.businessanalytics.BaMetricsEngine.class,()->mock(com.ruoyi.majorpilot.businessanalytics.BaMetricsEngine.class));
        context.registerBean(com.ruoyi.majorpilot.report.claims.EvidenceRuleRegistry.class,()->new com.ruoyi.majorpilot.report.claims.EvidenceRuleRegistry());
        context.registerBean(com.ruoyi.majorpilot.integration.ai.ReportGateway.class,()->mock(com.ruoyi.majorpilot.integration.ai.ReportGateway.class));
        context.register(com.ruoyi.majorpilot.acceptance.LocalProductAccess.class,com.ruoyi.majorpilot.recommendation.MajorCatalog.class);
        context.register(com.ruoyi.majorpilot.report.ReportConfiguration.class,com.ruoyi.majorpilot.report.ReportStore.class,com.ruoyi.majorpilot.report.ReportCoordinator.class,com.ruoyi.majorpilot.report.ReportJobs.class,com.ruoyi.majorpilot.report.ReportService.class,com.ruoyi.majorpilot.report.ReportController.class,com.ruoyi.majorpilot.report.ReportAdminController.class,com.ruoyi.majorpilot.report.FeedbackService.class,com.ruoyi.majorpilot.report.FeedbackController.class,com.ruoyi.majorpilot.recommendation.NextRecommendations.class);
        context.register(RunStore.class,RunService.class,HintService.class,FixedExecutionCalculator.class,ExecutionService.class,ReflectionService.class,FollowUpService.class,ClosurePipeline.class,EvidenceJobs.class,RunController.class);
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
    @Test void completeProductionExperienceGraphAndEvidenceSchedulerAreWired(){try(var context=context(true)){assertNotNull(context.getBean(RunController.class));assertNotNull(context.getBean(ReflectionService.class));assertNotNull(context.getBean(FixedExecutionCalculator.class));assertNotNull(context.getBean(com.ruoyi.majorpilot.report.ReportController.class));assertNotNull(context.getBean(com.ruoyi.majorpilot.report.ReportAdminController.class));assertNotNull(context.getBean(com.ruoyi.majorpilot.report.ReportJobs.class));assertNotNull(context.getBean(com.ruoyi.majorpilot.report.ReportCoordinator.class));assertDoesNotThrow(()->context.getBean(EvidenceJobs.class).tick());verify(context.getBean(JdbcTemplate.class)).queryForList(startsWith("SELECT id,owner_student_id FROM mp_background_job"));}}
}
