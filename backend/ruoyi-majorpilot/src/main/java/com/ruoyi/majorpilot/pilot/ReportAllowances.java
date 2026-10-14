package com.ruoyi.majorpilot.pilot;

import com.ruoyi.majorpilot.shared.ApiException;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Reservations and report/job writes must commit together; no Redis-only quota. */
@Service
@Profile("pilot")
public class ReportAllowances {
    private final JdbcTemplate jdbc;

    public ReportAllowances(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Pool(int limit, int used, int remaining, int reserved) {}

    public Map<String, Pool> current(long student) {
        requireMember(student);
        return Map.of("experience", pool(student, "EXPERIENCE"), "comparison", pool(student, "COMPARISON"));
    }

    public boolean reserve(long student, String version, String type) {
        requireTransaction();
        int limit = limit(type);
        // Match the account -> allowance lock order used by login, closing and workers.
        var accounts = jdbc.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE", student);
        if (accounts.size() != 1 || !"ACTIVE".equals(accounts.getFirst().get("status")))
            throw new ApiException(403, "PILOT_ACCOUNT_REQUIRED");
        var members = jdbc.queryForList("SELECT student_id FROM mp_pilot_account WHERE student_id=? FOR UPDATE", student);
        if (members.size() != 1) throw new ApiException(403, "PILOT_ACCOUNT_REQUIRED");
        var previous = jdbc.queryForList("SELECT student_id,report_type,status FROM mp_pilot_report_usage WHERE report_version_public_id=?", version);
        if (!previous.isEmpty()) {
            var row = previous.getFirst();
            if (((Number) row.get("student_id")).longValue() != student || !type.equals(row.get("report_type")))
                throw new ApiException(409, "PILOT_RESERVATION_INVALID");
            return !"RELEASED".equals(row.get("status"));
        }
        if (pool(student, type).used() >= limit) return false;
        jdbc.update("INSERT INTO mp_pilot_report_usage(student_id,report_version_public_id,report_type) VALUES(?,?,?)", student, version, type);
        return true;
    }

    /** Called in the same fenced transaction as external_started_at, before network I/O. */
    public void started(long student, String version) {
        requireTransaction();
        int changed = jdbc.update("UPDATE mp_pilot_report_usage SET status='STARTED',started_at=COALESCE(started_at,UTC_TIMESTAMP(3)) WHERE student_id=? AND report_version_public_id=? AND status IN ('RESERVED','STARTED')", student, version);
        if (changed != 1) throw new ApiException(409, "PILOT_RESERVATION_INVALID");
    }

    public void finish(long student, String version, boolean success) {
        requireTransaction();
        if (success) {
            int changed = jdbc.update("UPDATE mp_pilot_report_usage SET status='SUCCEEDED',completed_at=UTC_TIMESTAMP(3) WHERE student_id=? AND report_version_public_id=? AND status='STARTED'", student, version);
            if (changed != 1) throw new ApiException(409, "PILOT_RESERVATION_INVALID");
        } else {
            jdbc.update("UPDATE mp_pilot_report_usage SET status=IF(started_at IS NULL,'RELEASED','FAILED'),completed_at=UTC_TIMESTAMP(3) WHERE student_id=? AND report_version_public_id=? AND status IN ('RESERVED','STARTED')", student, version);
        }
    }

    private Pool pool(long student, String type) {
        var row = jdbc.queryForMap("SELECT COUNT(*) AS used,COALESCE(SUM(status='RESERVED'),0) AS reserved FROM mp_pilot_report_usage WHERE student_id=? AND report_type=? AND status<>'RELEASED'", student, type);
        int used = ((Number) row.get("used")).intValue(), limit = limit(type);
        return new Pool(limit, used, Math.max(0, limit - used), ((Number) row.get("reserved")).intValue());
    }

    private void requireMember(long student) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM mp_pilot_account WHERE student_id=?", Integer.class, student) != 1)
            throw new ApiException(403, "PILOT_ACCOUNT_REQUIRED");
    }

    private static int limit(String type) {
        return switch (type) {
            case "EXPERIENCE" -> 3;
            case "COMPARISON" -> 2;
            default -> throw new ApiException(422, "PILOT_REPORT_TYPE_INVALID");
        };
    }

    private static void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Pilot allowance writes require the report transaction");
    }
}
