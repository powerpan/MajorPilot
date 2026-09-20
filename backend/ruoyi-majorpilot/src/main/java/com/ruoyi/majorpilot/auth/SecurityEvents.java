package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.shared.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
@Service @Profile("local")
public class SecurityEvents {
    private final JdbcTemplate jdbc;private final Secrets secrets;
    public SecurityEvents(JdbcTemplate jdbc,Secrets secrets) { this.jdbc=jdbc;this.secrets=secrets; }
    public void record(Long studentId,String event,String source,String requestId) { jdbc.update("INSERT INTO mp_security_event(public_id,student_id,event_code,source_hash,request_id) VALUES(?,?,?,?,?)",PublicIds.next(),studentId,event,secrets.hmac("source",source),requestId); }
}
