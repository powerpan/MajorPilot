package com.ruoyi.majorpilot.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.privacy.PrivateObjectStore;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OperationsWiringTest {
    @TempDir Path directory;
    @Test void actualComponentScanWiresEveryAdminBeanWithoutQueryOrStartingWorkers()throws Exception{
        try(var context=new AnnotationConfigApplicationContext()){
            context.setEnvironment(new MockEnvironment());context.getEnvironment().setActiveProfiles("local");
            var db=mock(JdbcTemplate.class);var tx=new TransactionTemplate(new DataSourceTransactionManager(mock(DataSource.class)));var mapper=new ObjectMapper().findAndRegisterModules();
            context.registerBean(JdbcTemplate.class,()->db);context.registerBean(TransactionTemplate.class,()->tx);context.registerBean(ObjectMapper.class,()->mapper);
            context.registerBean(Secrets.class,()->new Secrets("synthetic-wiring-secret-".repeat(3)));context.registerBean(IdempotencyService.class,()->mock(IdempotencyService.class));context.registerBean(RateLimits.class,()->mock(RateLimits.class));
            var root=directory.toRealPath().toString();context.registerBean(PrivateObjectStore.class,()->new PrivateObjectStore(root));context.scan("com.ruoyi.majorpilot.operations");
            assertDoesNotThrow(context::refresh);assertNotNull(context.getBean(OperationsController.class));assertNotNull(context.getBean(AdminExportController.class));assertNotNull(context.getBean(AdminExportJobs.class));assertNotNull(context.getBean(OperationsMetrics.class));
            verify(db).afterPropertiesSet();verifyNoMoreInteractions(db);
        }
    }
}
