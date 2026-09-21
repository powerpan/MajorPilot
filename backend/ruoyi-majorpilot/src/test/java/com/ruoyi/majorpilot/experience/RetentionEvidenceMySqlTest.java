package com.ruoyi.majorpilot.experience;

import com.ruoyi.majorpilot.privacy.PrivateObjectStore;
import com.ruoyi.majorpilot.report.ReportCoordinator;
import com.ruoyi.majorpilot.retention.*;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import static com.ruoyi.majorpilot.experience.ExperienceMySqlTest.*;
import static org.junit.jupiter.api.Assertions.*;

/** Uses the full isolated P6 test content and actual closure/evidence/report engines, no model HTTP. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class RetentionEvidenceMySqlTest {
    @TempDir Path directory;ReportMySqlTest fixture;
    @BeforeAll static void database(){ReportMySqlTest.database();}
    @AfterAll static void contentCleanup(){ReportMySqlTest.contentCleanup();}
    @BeforeEach void setup()throws Exception{fixture=new ReportMySqlTest();fixture.setup();}
    @AfterEach void cleanup(){fixture.cleanup();}
    @Test void reconcilerNeededEvidenceIsRetainedThenOnlyOriginMetadataIsDetached()throws Exception{
        var f=fixture.f;f.close(f.toReflection(f.toEvaluation(fixture.formal())));
        // Reproduce a process boundary: evidence commits without the report-ready callback.
        var absent=new StaticListableBeanFactory(Map.of());var evidence=new EvidenceJobs(f.runs,f.closure,fixture.registry,absent.getBeanProvider(ReportCoordinator.class));var lease=evidence.claim("retention-evidence");assertNotNull(lease);evidence.process(lease);
        db.update("UPDATE mp_background_job SET completed_at=UTC_TIMESTAMP(3)-INTERVAL 31 DAY WHERE id=?",lease.job());String before=db.queryForObject("SELECT snapshot_sha256 FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot());String rule=db.queryForObject("SELECT evidence_rule_version FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot());long items=db.queryForObject("SELECT COUNT(*) FROM mp_evidence_item WHERE evidence_snapshot_id=?",Long.class,lease.snapshot());
        var retention=new RetentionService(db,tx,mapper,new PrivateObjectStore(directory.toRealPath().toString()));retention.run(RetentionPolicy.TERMINAL_JOBS,Instant.now(),100,()->true);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE id=?",Integer.class,lease.job()));assertEquals(lease.job(),db.queryForObject("SELECT origin_job_id FROM mp_evidence_snapshot WHERE id=?",Long.class,lease.snapshot()));
        fixture.coordinator.reconcile();var report=db.queryForMap("SELECT * FROM mp_report WHERE student_id=? AND report_type='EXPERIENCE'",f.student.internalId());long version=((Number)report.get("generation_target_version_id")).longValue();long reportJob=db.queryForObject("SELECT id FROM mp_background_job WHERE job_type='REPORT_GENERATE' AND target_id=?",Long.class,version);
        // A terminal job attached to a still-current generating version is not ordinary garbage.
        db.update("UPDATE mp_background_job SET status='FAILED',completed_at=UTC_TIMESTAMP(3)-INTERVAL 91 DAY WHERE id=?",reportJob);retention.run(RetentionPolicy.TERMINAL_JOBS,Instant.now(),100,()->true);assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE id=?",Integer.class,reportJob));assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE id=?",Integer.class,lease.job()));assertNull(db.queryForObject("SELECT origin_job_id FROM mp_evidence_snapshot WHERE id=?",Long.class,lease.snapshot()));
        assertEquals(before,db.queryForObject("SELECT snapshot_sha256 FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot()));assertEquals(rule,db.queryForObject("SELECT evidence_rule_version FROM mp_evidence_snapshot WHERE id=?",String.class,lease.snapshot()));assertEquals(items,db.queryForObject("SELECT COUNT(*) FROM mp_evidence_item WHERE evidence_snapshot_id=?",Long.class,lease.snapshot()));
        db.update("UPDATE mp_background_job SET status='PENDING',completed_at=NULL,available_at=UTC_TIMESTAMP(3) WHERE id=?",reportJob);var worker=fixture.worker(fixture.off());worker.process(worker.claim("retention-report"));assertEquals("READY",db.queryForObject("SELECT status FROM mp_report_version WHERE id=?",String.class,version));
    }
}
