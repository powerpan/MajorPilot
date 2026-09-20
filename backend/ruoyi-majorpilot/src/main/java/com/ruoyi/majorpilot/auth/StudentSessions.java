package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.shared.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
@Service @Profile("local")
public class StudentSessions {
    private final JdbcTemplate jdbc;
    public StudentSessions(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public String issue(long studentId) { String secret=Secrets.random();Instant now=Instant.now();jdbc.update("INSERT INTO mp_student_session(student_id,token_hash,issued_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)",studentId,Secrets.hash(secret),Timestamp.from(now),Timestamp.from(now.plusSeconds(604800)),Timestamp.from(now));return secret; }
    public StudentPrincipal authenticate(String secret) {
        if(secret==null||secret.length()>128)throw new ApiException(401,"AUTH_REQUIRED");
        var rows=jdbc.queryForList("SELECT a.id,a.public_id,a.status,s.expires_at,s.last_seen_at FROM mp_student_session s JOIN mp_student_account a ON a.id=s.student_id WHERE s.token_hash=? AND s.status='ACTIVE'",Secrets.hash(secret));
        if(rows.isEmpty())throw new ApiException(401,"SESSION_EXPIRED");Map<String,Object> row=rows.getFirst();Instant now=Instant.now();
        if(!DbTimes.instant(row.get("expires_at")).isAfter(now)||!DbTimes.instant(row.get("last_seen_at")).plusSeconds(86400).isAfter(now)||!java.util.Set.of("ACTIVE","PENDING_VERIFICATION").contains(row.get("status"))) {
            jdbc.update("UPDATE mp_student_session SET status='EXPIRED' WHERE token_hash=? AND status='ACTIVE'",Secrets.hash(secret));throw new ApiException(401,"SESSION_EXPIRED");
        }
        if(jdbc.update("UPDATE mp_student_session SET last_seen_at=? WHERE token_hash=? AND status='ACTIVE'",Timestamp.from(now),Secrets.hash(secret))!=1)throw new ApiException(401,"SESSION_EXPIRED");
        return new StudentPrincipal(((Number)row.get("id")).longValue(),(String)row.get("public_id"),(String)row.get("status"));
    }
    public void revokeCurrent(String secret) { if(secret!=null)jdbc.update("UPDATE mp_student_session SET status='REVOKED',revoked_at=UTC_TIMESTAMP(3),revoke_reason='LOGOUT' WHERE token_hash=? AND status='ACTIVE'",Secrets.hash(secret)); }
    public void revokeAll(long studentId,String reason) { jdbc.update("UPDATE mp_student_session SET status='REVOKED',revoked_at=UTC_TIMESTAMP(3),revoke_reason=? WHERE student_id=? AND status='ACTIVE'",reason,studentId); }
}
