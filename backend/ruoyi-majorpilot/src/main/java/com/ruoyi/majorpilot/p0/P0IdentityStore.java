package com.ruoyi.majorpilot.p0;

import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Profile("p0")
public class P0IdentityStore {
    private final JdbcTemplate jdbc;
    public P0IdentityStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public String intake(String secret) {
        String id=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO mp_p0_intake(id,secret_hash,expires_at) VALUES(?,?,UTC_TIMESTAMP(6)+INTERVAL 7 DAY)",id,P0Crypto.hash(secret)); return id;
    }
    @Transactional public String claim(String secret) {
        if(secret==null) throw new P0Http.Rejected(401,"INTAKE_REQUIRED");
        var rows=jdbc.queryForList("SELECT id,actor_id FROM mp_p0_intake WHERE secret_hash=? AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE",P0Crypto.hash(secret));
        if(rows.isEmpty() || rows.get(0).get("actor_id") != null) throw new P0Http.Rejected(409,"INTAKE_UNAVAILABLE");
        String actor=UUID.randomUUID().toString();
        jdbc.update("INSERT INTO mp_p0_actor(id) VALUES(?)",actor);
        jdbc.update("UPDATE mp_p0_intake SET actor_id=? WHERE id=?",actor,rows.get(0).get("id")); return actor;
    }
    @Transactional public String login(String actor) {
        var rows=jdbc.queryForList("SELECT id FROM mp_p0_actor WHERE id=? AND state='ACTIVE' FOR UPDATE",actor);
        if(rows.isEmpty()) throw new P0Http.Rejected(401,"AUTH_REQUIRED");
        String secret=P0Crypto.secret();
        jdbc.update("INSERT INTO mp_p0_session(secret_hash,actor_id,expires_at,last_seen_at) VALUES(?,?,UTC_TIMESTAMP(6)+INTERVAL 7 DAY,UTC_TIMESTAMP(6))",P0Crypto.hash(secret),actor); return secret;
    }
    public String authenticate(String secret) {
        if(secret==null || secret.length()>128) return null;
        String hash=P0Crypto.hash(secret);
        var rows=jdbc.queryForList("SELECT s.actor_id FROM mp_p0_session s JOIN mp_p0_actor a ON a.id=s.actor_id WHERE s.secret_hash=? AND s.revoked=FALSE AND s.expires_at>UTC_TIMESTAMP(6) AND s.last_seen_at>UTC_TIMESTAMP(6)-INTERVAL 24 HOUR AND a.state='ACTIVE'",hash);
        if(rows.isEmpty()) return null;
        jdbc.update("UPDATE mp_p0_session SET last_seen_at=UTC_TIMESTAMP(6) WHERE secret_hash=?",hash); return (String) rows.get(0).get("actor_id");
    }
    public void logout(String secret) { jdbc.update("UPDATE mp_p0_session SET revoked=TRUE WHERE secret_hash=?",P0Crypto.hash(secret)); }
    public String receipt(String actor,String secret) {
        String id=UUID.randomUUID().toString(); jdbc.update("INSERT INTO mp_p0_receipt(id,actor_id,secret_hash,expires_at) VALUES(?,?,?,UTC_TIMESTAMP(6)+INTERVAL 7 DAY)",id,actor,P0Crypto.hash(secret)); return id;
    }
    @Transactional public void delete(String actor) {
        jdbc.queryForObject("SELECT id FROM mp_p0_actor WHERE id=? FOR UPDATE",String.class,actor);
        if(jdbc.queryForObject("SELECT COUNT(*) FROM mp_p0_receipt WHERE actor_id=? AND state='REQUESTED' AND expires_at>UTC_TIMESTAMP(6)",Integer.class,actor)==0) throw new P0Http.Rejected(409,"RECEIPT_REQUIRED");
        jdbc.update("UPDATE mp_p0_actor SET state='DELETED' WHERE id=?",actor);
        jdbc.update("UPDATE mp_p0_session SET revoked=TRUE WHERE actor_id=?",actor);
        jdbc.update("UPDATE mp_background_job SET status='CANCELLED' WHERE owner_student_id=? AND status IN ('PENDING','RUNNING','RETRY_WAIT')",actor);
        jdbc.update("DELETE FROM mp_p0_example WHERE actor_id=?",actor);
        jdbc.update("UPDATE mp_p0_receipt SET state='COMPLETED',actor_id=NULL,expires_at=UTC_TIMESTAMP(6)+INTERVAL 90 DAY WHERE actor_id=?",actor);
        // Synthetic P0 actor retained only to test deletion-race fencing. P7 implements the real deletion job.
    }
    public Map<String,Object> receiptStatus(String id,String secret) {
        if(secret==null) throw new P0Http.Rejected(404,"NOT_FOUND");
        var rows=jdbc.queryForList("SELECT state FROM mp_p0_receipt WHERE id=? AND secret_hash=? AND expires_at>UTC_TIMESTAMP(6)",id,P0Crypto.hash(secret));
        if(rows.isEmpty()) throw new P0Http.Rejected(404,"NOT_FOUND"); return Map.of("status",rows.get(0).get("state"));
    }
}
