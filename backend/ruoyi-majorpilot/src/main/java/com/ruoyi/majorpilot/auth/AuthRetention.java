package com.ruoyi.majorpilot.auth;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
/** Bounded retention of expired security metadata, never account erasure. */
@Component @Profile({"local","pilot"})
public class AuthRetention {
    private final JdbcTemplate jdbc;
    public AuthRetention(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    @Scheduled(initialDelay=300000,fixedDelay=1800000) public void cleanExpiredMetadata() {
        jdbc.update("UPDATE mp_student_session SET status='EXPIRED' WHERE status='ACTIVE' AND (expires_at<=UTC_TIMESTAMP(3) OR last_seen_at<UTC_TIMESTAMP(3)-INTERVAL 24 HOUR) LIMIT 500");
        jdbc.update("DELETE FROM mp_student_session WHERE (status='REVOKED' AND revoked_at<UTC_TIMESTAMP(3)-INTERVAL 30 DAY) OR (status='EXPIRED' AND expires_at<UTC_TIMESTAMP(3)-INTERVAL 30 DAY) LIMIT 500");
        jdbc.update("DELETE FROM mp_email_token WHERE expires_at<UTC_TIMESTAMP(3)-INTERVAL 7 DAY LIMIT 500");
        jdbc.update("DELETE FROM mp_idempotency_record WHERE expires_at<=UTC_TIMESTAMP(3) LIMIT 500");
        jdbc.update("DELETE FROM mp_security_event WHERE occurred_at<UTC_TIMESTAMP(3)-INTERVAL 180 DAY LIMIT 500");
    }
}
