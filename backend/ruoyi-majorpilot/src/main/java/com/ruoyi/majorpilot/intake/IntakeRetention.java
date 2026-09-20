package com.ruoyi.majorpilot.intake;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** Bounded P1 retention: only expired, unclaimed intake data. Never deletes Student-owned records. */
@Component @Profile("local")
public class IntakeRetention {
    private final JdbcTemplate jdbc;private final TransactionTemplate tx;
    public IntakeRetention(JdbcTemplate jdbc,TransactionTemplate tx) { this.jdbc=jdbc;this.tx=tx; }
    @Scheduled(fixedDelay=60000,initialDelay=60000) public void scheduled() { purgeExpired(Instant.now(),50); }
    public int purgeExpired(Instant now,int batchSize) {
        if(batchSize<1||batchSize>100)throw new IllegalArgumentException("Invalid retention batch size");
        return tx.execute(status->{
            List<Long> ids=jdbc.queryForList("SELECT id FROM mp_intake_session WHERE claimed_student_id IS NULL AND status IN ('DRAFT','SUBMITTED','EXPIRED') AND expires_at<=? ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED",Long.class,Timestamp.from(now),batchSize);
            for(long id:ids) {
                jdbc.update("DELETE FROM mp_product_event WHERE intake_session_id=? AND student_id IS NULL",id);
                jdbc.update("DELETE FROM mp_idempotency_record WHERE owner_intake_session_id=? AND owner_student_id IS NULL",id);
                jdbc.update("DELETE FROM mp_consent_record WHERE intake_session_id=? AND student_id IS NULL",id);
                jdbc.update("DELETE rr FROM mp_recommendation_reason rr JOIN mp_recommendation r ON r.id=rr.recommendation_id JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE p.intake_session_id=? AND r.student_id IS NULL",id);
                jdbc.update("DELETE r FROM mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE p.intake_session_id=? AND r.student_id IS NULL",id);
                jdbc.update("DELETE a FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id WHERE p.intake_session_id=? AND p.student_id IS NULL",id);
                // Remove references newest-first without rewriting immutable answer data.
                List<Long> profiles=jdbc.queryForList("SELECT id FROM mp_decision_profile WHERE intake_session_id=? AND student_id IS NULL ORDER BY profile_version_no DESC",Long.class,id);
                for(long profile:profiles)jdbc.update("DELETE FROM mp_decision_profile WHERE id=? AND student_id IS NULL",profile);
                jdbc.update("DELETE FROM mp_intake_session WHERE id=? AND claimed_student_id IS NULL",id);
            }
            return ids.size();
        });
    }
}
