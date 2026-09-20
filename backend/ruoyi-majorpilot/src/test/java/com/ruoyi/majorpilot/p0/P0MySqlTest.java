package com.ruoyi.majorpilot.p0;

import static org.junit.jupiter.api.Assertions.*;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Opt-in real MySQL tests. Skips are not reported as passing database validation. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class P0MySqlTest {
    static JdbcTemplate jdbc;static DataSourceTransactionManager manager; P0JobStore jobs;String actor;
    @BeforeAll static void migrate() {
        String url=System.getenv("MP_DB_URL");
        if(url==null || !url.contains("/majorpilot?")) throw new IllegalArgumentException("Tests require dedicated majorpilot URL");
        url=url.replace("/majorpilot?","/majorpilot_test?");
        var ds=new DriverManagerDataSource(url,System.getenv("MP_DB_USERNAME"),System.getenv("MP_DB_PASSWORD"));
        Flyway flyway=Flyway.configure().dataSource(ds).locations("classpath:db/migration").cleanDisabled(true).load();flyway.migrate();flyway.validate();
        jdbc=new JdbcTemplate(ds);manager=new DataSourceTransactionManager(ds);
    }
    @BeforeEach void setup() { actor=UUID.randomUUID().toString();jdbc.update("INSERT INTO mp_p0_actor(id) VALUES(?)",actor);jobs=new P0JobStore(jdbc,manager); }
    @AfterEach void cleanup() {
        jdbc.update("DELETE r FROM mp_p0_job_result r JOIN mp_background_job j ON j.id=r.job_id WHERE j.owner_student_id=?",actor);
        jdbc.update("DELETE FROM mp_background_job WHERE owner_student_id=?",actor);jdbc.update("DELETE FROM mp_p0_example WHERE actor_id=?",actor);jdbc.update("DELETE FROM mp_p0_actor WHERE id=?",actor);
    }
    @Test void transactionRollbackRemovesExampleAndJob() {
        new TransactionTemplate(manager).execute(status->{jdbc.update("INSERT INTO mp_p0_example(id,actor_id,label) VALUES(?,?,?)",UUID.randomUUID().toString(),actor,"rollback-probe");jobs.enqueue(actor,"rollback-"+actor);status.setRollbackOnly();return null;});
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM mp_p0_example WHERE actor_id=?",Integer.class,actor));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE owner_student_id=?",Integer.class,actor));
    }
    @Test void concurrentClaimHasOneWinner() throws Exception {
        jobs.enqueue(actor,"concurrent-"+actor);
        try(var workers=Executors.newFixedThreadPool(2)) {
            var results=workers.invokeAll(List.<Callable<P0JobStore.Lease>>of(()->jobs.claim("a"),()->jobs.claim("b")));
            int won=0;for(var result:results) if(result.get()!=null) won++;assertEquals(1,won);
        }
    }
    @Test void expiredLeaseCannotHeartbeatOrPublishAndNewGenerationCan() {
        String id=jobs.enqueue(actor,"fence-"+actor);var old=jobs.claim("old");
        jdbc.update("UPDATE mp_background_job SET lease_until=UTC_TIMESTAMP(6)-INTERVAL 1 SECOND WHERE id=?",id);
        assertFalse(jobs.heartbeat(old));assertFalse(jobs.complete(old));
        var replacement=new P0JobStore(jdbc,manager).claim("new");assertEquals(old.version()+1,replacement.version());
        assertFalse(jobs.complete(old));assertTrue(jobs.heartbeat(replacement));assertTrue(jobs.complete(replacement));assertFalse(jobs.complete(replacement));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM mp_p0_job_result WHERE job_id=?",Integer.class,id));
    }
    @Test void committedPendingSurvivesNewWorkerAndBusinessKeyDeduplicates() {
        String id=jobs.enqueue(actor,"restart-"+actor);assertEquals(id,jobs.enqueue(actor,"restart-"+actor));
        var restarted=new P0JobStore(new JdbcTemplate(jdbc.getDataSource()),manager);var lease=restarted.claim("after-restart");assertEquals(id,lease.id());assertTrue(restarted.complete(lease));
    }
    @Test void deletedActorRejectsLateResult() {
        jobs.enqueue(actor,"delete-"+actor);var lease=jobs.claim("late");jdbc.update("UPDATE mp_p0_actor SET state='DELETED' WHERE id=?",actor);
        assertFalse(jobs.complete(lease));assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM mp_p0_job_result WHERE job_id=?",Integer.class,lease.id()));
    }
    @Test void retriesBoundedToThreeAttempts() {
        String id=jobs.enqueue(actor,"retry-"+actor);
        for(int attempt=1;attempt<=3;attempt++) {
            var lease=jobs.claim("retry-worker");assertNotNull(lease);assertTrue(jobs.retry(lease));
            if(attempt<3) jdbc.update("UPDATE mp_background_job SET available_at=UTC_TIMESTAMP(6)-INTERVAL 1 SECOND WHERE id=?",id);
        }
        assertEquals("FAILED",jdbc.queryForObject("SELECT status FROM mp_background_job WHERE id=?",String.class,id));assertNull(jobs.claim("fourth"));
    }
}
