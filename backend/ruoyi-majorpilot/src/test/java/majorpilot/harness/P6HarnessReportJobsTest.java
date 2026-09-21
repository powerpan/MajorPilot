package majorpilot.harness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.integration.ai.ReportGateway;
import com.ruoyi.majorpilot.report.*;
import com.ruoyi.majorpilot.report.core.ReportCore;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class P6HarnessReportJobsTest {
    @TempDir Path temporary;
    private Path directory() throws Exception {return Files.createDirectories(temporary.resolve("data/p6-harness"));}
    private MockEnvironment environment(Path directory){var env=new MockEnvironment().withProperty("MP_P6_HARNESS_DIR",directory.toString()).withProperty("MP_P6_RUN_TAG","0123456789abcdef");env.setActiveProfiles("local","p6-harness");return env;}
    private P6HarnessReportJobs jobs(ReportStore store,Path dir){when(store.mapper()).thenReturn(new ObjectMapper());return new P6HarnessReportJobs(store,mock(ReportCore.class),mock(ReportCoordinator.class),mock(ReportGateway.class),environment(dir));}
    @Test void requiresExplicitTestProfileAndKeepsActualScheduledImplementation() throws Exception {
        Path dir=directory();var env=environment(dir);env.setActiveProfiles("local");
        assertThrows(IllegalStateException.class,()->new P6HarnessReportJobs(mock(ReportStore.class),mock(ReportCore.class),mock(ReportCoordinator.class),mock(ReportGateway.class),env));
        assertEquals(ReportJobs.class,P6HarnessReportJobs.class.getMethod("tick").getDeclaringClass());
        assertNotNull(P6HarnessReportJobs.class.getMethod("tick").getAnnotation(Scheduled.class));
    }
    @Test void malformedControlFailsWithoutDatabaseOrSecretEcho() throws Exception {
        Path dir=directory();var store=mock(ReportStore.class);var jobs=jobs(store,dir);
        Files.writeString(dir.resolve("checkpoint-control.json"),"{\"stage\":\"sensitive-synthetic-value\"}");
        try{var failure=assertThrows(IllegalStateException.class,()->jobs.publish(null,null,null,null,null));assertFalse(failure.getMessage().contains("sensitive-synthetic"));verify(store,never()).tx();verify(store,never()).db();}finally{jobs.stop();}
    }
    @Test void passUsesRealPublicationFence() throws Exception {
        Path dir=directory();var store=mock(ReportStore.class);var transaction=mock(TransactionTemplate.class);when(store.tx()).thenReturn(transaction);var jobs=jobs(store,dir);
        try{assertFalse(jobs.publish(null,null,null,null,null));verify(store).tx();}finally{jobs.stop();}
    }
    @Test void interruptedGateCannotReachPublication() throws Exception {
        Path dir=directory();var store=mock(ReportStore.class);var db=mock(JdbcTemplate.class);when(store.db()).thenReturn(db);
        when(db.queryForObject(anyString(),eq(Integer.class),any(Object[].class))).thenReturn(1);
        var jobs=jobs(store,dir);Files.writeString(dir.resolve("checkpoint-control.json"),"{\"stage\":\"BEFORE_PUBLISH\"}");
        try{Thread.currentThread().interrupt();assertFalse(jobs.publish(new ReportJobs.Lease(1,2,3,4,1,"test-worker","REPORT_GENERATE"),null,null,null,null));assertTrue(Files.exists(dir.resolve("checkpoint-entered.json")));verify(store,never()).tx();}finally{Thread.interrupted();jobs.stop();}
    }
}
