package com.ruoyi.majorpilot.p0;

import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** MySQL is the durable queue. Lease generation and account locking fence every result write. */
@Service @Profile("p0")
public class P0JobStore {
    public record Lease(String id,String owner,long version,String worker) {}
    private final JdbcTemplate jdbc; private final TransactionTemplate tx;
    public P0JobStore(JdbcTemplate jdbc,PlatformTransactionManager manager) { this.jdbc=jdbc;this.tx=new TransactionTemplate(manager); }
    public String enqueue(String actor,String businessKey) {
        return tx.execute(status->{
            var owners=jdbc.queryForList("SELECT state FROM mp_p0_actor WHERE id=? FOR UPDATE",actor);
            if(owners.isEmpty() || !"ACTIVE".equals(owners.get(0).get("state"))) throw new P0Http.Rejected(409,"ACTOR_UNAVAILABLE");
            String id=UUID.randomUUID().toString();
            jdbc.update("INSERT IGNORE INTO mp_background_job(id,job_type,business_key,owner_student_id) VALUES(?,'P0_PROBE',?,?)",id,businessKey,actor);
            return jdbc.queryForObject("SELECT id FROM mp_background_job WHERE business_key=? AND owner_student_id=?",String.class,businessKey,actor);
        });
    }
    public Lease claim(String worker) {
        return tx.execute(status->{
            jdbc.update("UPDATE mp_background_job SET status='FAILED',last_error_code='LEASE_EXPIRED',completed_at=UTC_TIMESTAMP(6) WHERE job_type='P0_PROBE' AND status='RUNNING' AND lease_until<=UTC_TIMESTAMP(6) AND attempt_count>=3");
            var rows=jdbc.queryForList("SELECT id,owner_student_id,lease_version FROM mp_background_job WHERE job_type='P0_PROBE' AND attempt_count<3 AND ((status IN ('PENDING','RETRY_WAIT') AND available_at<=UTC_TIMESTAMP(6)) OR (status='RUNNING' AND lease_until<=UTC_TIMESTAMP(6))) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");
            if(rows.isEmpty()) return null;
            var row=rows.get(0);String id=(String)row.get("id");long version=((Number)row.get("lease_version")).longValue()+1;
            jdbc.update("UPDATE mp_background_job SET status='RUNNING',attempt_count=attempt_count+1,lease_version=?,worker_id=?,lease_until=UTC_TIMESTAMP(6)+INTERVAL 60 SECOND,started_at=COALESCE(started_at,UTC_TIMESTAMP(6)) WHERE id=?",version,worker,id);
            return new Lease(id,(String)row.get("owner_student_id"),version,worker);
        });
    }
    public boolean heartbeat(Lease lease) { return jdbc.update("UPDATE mp_background_job SET lease_until=UTC_TIMESTAMP(6)+INTERVAL 60 SECOND WHERE id=? AND lease_version=? AND worker_id=? AND status='RUNNING' AND lease_until>UTC_TIMESTAMP(6)",lease.id,lease.version,lease.worker)==1; }
    public boolean complete(Lease lease) {
        return Boolean.TRUE.equals(tx.execute(status->{
            var actors=jdbc.queryForList("SELECT state FROM mp_p0_actor WHERE id=? FOR UPDATE",lease.owner);
            if(actors.isEmpty() || !"ACTIVE".equals(actors.get(0).get("state"))) return false;
            int changed=jdbc.update("UPDATE mp_background_job SET status='SUCCEEDED',completed_at=UTC_TIMESTAMP(6),lease_until=NULL WHERE id=? AND lease_version=? AND worker_id=? AND status='RUNNING' AND lease_until>UTC_TIMESTAMP(6)",lease.id,lease.version,lease.worker);
            if(changed!=1) return false;
            jdbc.update("INSERT INTO mp_p0_job_result(job_id,lease_version) VALUES(?,?)",lease.id,lease.version);return true;
        }));
    }
    public boolean retry(Lease lease) {
        return jdbc.update("UPDATE mp_background_job SET status=IF(attempt_count>=3,'FAILED','RETRY_WAIT'),last_error_code='P0_TRANSIENT',available_at=UTC_TIMESTAMP(6)+INTERVAL IF(attempt_count=1,5,30) SECOND,lease_until=NULL WHERE id=? AND lease_version=? AND worker_id=? AND status='RUNNING' AND lease_until>UTC_TIMESTAMP(6)",lease.id,lease.version,lease.worker)==1;
    }
}
