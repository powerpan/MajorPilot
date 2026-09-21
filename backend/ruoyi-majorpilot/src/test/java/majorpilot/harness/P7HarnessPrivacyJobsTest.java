package majorpilot.harness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.privacy.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class P7HarnessPrivacyJobsTest {
    @TempDir Path temporary;
    private Path directory() throws Exception{return Files.createDirectories(temporary.toRealPath().resolve("data/p6-harness"));}
    private MockEnvironment environment(Path dir){var e=new MockEnvironment().withProperty("MP_P6_HARNESS_DIR",dir.toString()).withProperty("MP_P6_RUN_TAG","0123456789abcdef");e.setActiveProfiles("local","p6-harness");return e;}
    @Test void requiresExactTestProfilesAndRetainsRealScheduling() throws Exception{
        var dir=directory();var env=environment(dir);env.setActiveProfiles("local");
        assertThrows(IllegalStateException.class,()->new P7HarnessPrivacyCheckpoints(mock(JdbcTemplate.class),new ObjectMapper(),env));
        assertEquals(PrivacyJobs.class,P7HarnessPrivacyJobs.class.getMethod("tick").getDeclaringClass());
        assertNotNull(P7HarnessPrivacyJobs.class.getMethod("tick").getAnnotation(Scheduled.class));
        assertEquals("${MP_P6_HARNESS_DIR}/private-exports",P6HarnessApplication.properties().get("MP_PRIVATE_EXPORT_ROOT"));
    }
    @Test void rejectsMalformedControlWithoutDatabaseOrPayloadEcho() throws Exception{
        var dir=directory();var db=mock(JdbcTemplate.class);var gate=new P7HarnessPrivacyCheckpoints(db,new ObjectMapper(),environment(dir));
        for(String payload:List.of("{\"stage\":\"SECRET_SENTINEL\"}","{\"stage\":\"PASS\",\"extra\":true}","[]")){
            Files.writeString(dir.resolve("privacy-checkpoint-control.json"),payload);
            var failure=assertThrows(IllegalStateException.class,gate::control);assertFalse(failure.getMessage().contains("SECRET_SENTINEL"));
        }verifyNoInteractions(db);
    }
    @Test void symlinkControlIsRejectedWithoutFollowingIt() throws Exception{
        var dir=directory();var other=temporary.resolve("not-control");Files.writeString(other,"{\"stage\":\"PASS\"}");
        Files.createSymbolicLink(dir.resolve("privacy-checkpoint-control.json"),other);
        var gate=new P7HarnessPrivacyCheckpoints(mock(JdbcTemplate.class),new ObjectMapper(),environment(dir));assertThrows(IllegalStateException.class,gate::control);
    }
    @Test void interruptedCheckpointCannotContinueAndPersistsOnlyLeaseMetadata() throws Exception{
        var dir=directory();var db=mock(JdbcTemplate.class);when(db.queryForObject(anyString(),eq(Integer.class),any(Object[].class))).thenReturn(1);
        var mapper=new ObjectMapper();var gate=new P7HarnessPrivacyCheckpoints(db,mapper,environment(dir));
        Files.writeString(dir.resolve("privacy-checkpoint-control.json"),"{\"stage\":\"EXPORT_RESERVED\"}");
        try{Thread.currentThread().interrupt();assertThrows(IllegalStateException.class,()->gate.checkpoint("EXPORT_RESERVED",new PrivacyJobs.Lease(1,2,3,"STUDENT_EXPORT",1,"synthetic-worker")));
            var value=mapper.readTree(Files.readString(dir.resolve("privacy-checkpoint-entered.json")));assertEquals(Set.of("stage","lease"),new HashSet<>(mapper.convertValue(value,Map.class).keySet()));
            assertEquals("EXPORT_RESERVED",value.path("stage").asText());
        }finally{Thread.interrupted();}
    }
    @Test void passWriterStillRequiresProductionSnapshotTransaction() throws Exception{
        var dir=directory();var db=mock(JdbcTemplate.class);var mapper=new ObjectMapper();var gate=new P7HarnessPrivacyCheckpoints(db,mapper,environment(dir));
        var writer=new P7HarnessPersonalExportWriter(db,mapper,gate);
        var error=assertThrows(IllegalStateException.class,()->writer.build(1,"FULL_PERSONAL_EXPORT",Instant.now()));assertEquals("PERSONAL_EXPORT_SNAPSHOT_REQUIRED",error.getMessage());verifyNoInteractions(db);
    }
    @Test void productionProcessRejectsUnownedLeaseBeforeAnyExportOrDeletionWork() throws Exception{
        var dir=directory();var db=mock(JdbcTemplate.class);var mapper=new ObjectMapper();var transaction=mock(TransactionTemplate.class);
        var store=new PrivacyStore(db,transaction,mapper);var files=mock(PrivateObjectStore.class);var writer=mock(PersonalExportWriter.class);var deletion=mock(AccountDeletionStages.class);
        var jobs=new P7HarnessPrivacyJobs(store,files,writer,deletion,new P7HarnessPrivacyCheckpoints(db,mapper,environment(dir)));
        try{jobs.process(new PrivacyJobs.Lease(1,2,3,"STUDENT_EXPORT",1,"obsolete-worker"));jobs.process(new PrivacyJobs.Lease(2,2,4,"ACCOUNT_DELETE",1,"obsolete-worker"));
            verifyNoInteractions(transaction,files,writer,deletion);
        }finally{jobs.stop();}
    }
}
