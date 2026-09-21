package com.ruoyi.majorpilot.retention;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.privacy.PrivateObjectStore;
import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RetentionTest {
    @TempDir Path temp;
    @Test void policiesAreBoundedAndDoNotDuplicateExistingAuthOrIntakeSchedulers(){Instant now=Instant.parse("2026-09-21T00:00:00Z");assertEquals(now.minus(Duration.ofDays(90)),RetentionPolicy.AI_METADATA.cutoff(now));assertEquals(now.minus(Duration.ofDays(180)),RetentionPolicy.PRODUCT_EVENTS.cutoff(now));assertEquals(now.minus(Duration.ofDays(1)),RetentionPolicy.EXPORT_FILES.cutoff(now));assertEquals(now.minus(Duration.ofDays(7)),RetentionPolicy.UNCONFIRMED_DELETIONS.cutoff(now));assertEquals(9,RetentionPolicy.values().length);for(String legacy:List.of("INTAKE","SESSIONS","TOKENS","IDEMPOTENCY","SECURITY_EVENTS"))assertThrows(IllegalArgumentException.class,()->RetentionPolicy.parse(legacy));assertEquals(100,RetentionPolicy.checkedBatch(100));for(int bad:List.of(0,-1,101))assertThrows(IllegalArgumentException.class,()->RetentionPolicy.checkedBatch(bad));}
    @Test void hourlyKeysHaveNoSubjectOrPersonalData(){Instant now=Instant.parse("2026-09-21T01:42:59.123Z");assertEquals("retention:PRODUCT_EVENTS:2026-09-21T01:00:00Z",RetentionJobs.businessKey(RetentionPolicy.PRODUCT_EVENTS,now));assertEquals(RetentionJobs.businessKey(RetentionPolicy.PRODUCT_EVENTS,now),RetentionJobs.businessKey(RetentionPolicy.PRODUCT_EVENTS,now.minusSeconds(100)));}
    @Test void lostLeaseCannotStartAnyDatabaseOrFilesystemMutation(){var db=mock(JdbcTemplate.class);var tx=mock(TransactionTemplate.class);when(tx.execute(any())).thenAnswer(i->{TransactionCallback<?> action=i.getArgument(0);return action.doInTransaction(mock(TransactionStatus.class));});var files=mock(PrivateObjectStore.class);var service=new RetentionService(db,tx,new ObjectMapper(),files);assertEquals("RETENTION_LEASE_LOST",assertThrows(ApiException.class,()->service.run(RetentionPolicy.STALE_PARTIALS,Instant.now(),100,()->false)).code);verifyNoInteractions(db,files);}
    @Test void onlyOldPrivatePartialsUseTheExplicitDateAndHardLimit(){var db=mock(JdbcTemplate.class);var tx=mock(TransactionTemplate.class);when(tx.execute(any())).thenAnswer(i->{TransactionCallback<?> action=i.getArgument(0);return action.doInTransaction(mock(TransactionStatus.class));});var files=mock(PrivateObjectStore.class);Instant now=Instant.parse("2026-09-21T01:00:00Z");when(files.deletePartialsBefore(now.minus(Duration.ofDays(1)),10)).thenReturn(3);var service=new RetentionService(db,tx,new ObjectMapper(),files);assertEquals(3,service.run(RetentionPolicy.STALE_PARTIALS,now,10,()->true));verify(files).deletePartialsBefore(now.minus(Duration.ofDays(1)),10);verifyNoInteractions(db);}
    @Test void realSpringScanChoosesProductionClockConstructorWithoutStartingSchedule()throws Exception{try(var context=new AnnotationConfigApplicationContext()){context.setEnvironment(new MockEnvironment());context.getEnvironment().setActiveProfiles("local");var db=mock(JdbcTemplate.class);context.registerBean(JdbcTemplate.class,()->db);context.registerBean(TransactionTemplate.class,()->new TransactionTemplate(new DataSourceTransactionManager(mock(DataSource.class))));context.registerBean(ObjectMapper.class,()->new ObjectMapper());String root=temp.toRealPath().toString();context.registerBean(PrivateObjectStore.class,()->new PrivateObjectStore(root));context.scan("com.ruoyi.majorpilot.retention");assertDoesNotThrow(context::refresh);assertNotNull(context.getBean(RetentionJobs.class));assertNotNull(context.getBean(RetentionService.class));verify(db).afterPropertiesSet();verifyNoMoreInteractions(db);}}
}
