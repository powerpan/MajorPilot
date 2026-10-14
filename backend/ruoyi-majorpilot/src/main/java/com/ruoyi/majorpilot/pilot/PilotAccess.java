package com.ruoyi.majorpilot.pilot;

import com.ruoyi.majorpilot.auth.AuthDtos;
import com.ruoyi.majorpilot.auth.AuthService;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service @Profile("pilot")
public class PilotAccess {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    public PilotAccess(JdbcTemplate db, TransactionTemplate tx) { this.db=db;this.tx=tx; }
    public boolean isMember(long student) {
        return db.queryForObject("SELECT COUNT(*) FROM mp_pilot_account WHERE student_id=?",Integer.class,student)==1;
    }
    public boolean consented(long student) {
        return isMember(student) && db.queryForObject("SELECT COUNT(DISTINCT document_type) FROM mp_consent_record WHERE student_id=? AND document_type IN ('TERMS','PRIVACY') AND document_version='pilot-v1' AND decision='ACCEPTED'",Integer.class,student)==2;
    }
    public void accept(long student,List<AuthDtos.Consent> consents) {
        AuthService.validateConsents(consents,"pilot-v1");
        tx.executeWithoutResult(t->{
            var rows=db.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student);
            if(rows.size()!=1||!"ACTIVE".equals(rows.getFirst().get("status"))||!isMember(student))throw new ApiException(403,"PILOT_ACCOUNT_REQUIRED");
            // Replays must not silently renew withdrawn optional research consent.
            if(consented(student))return;
            for(var c:consents)db.update("INSERT INTO mp_consent_record(student_id,document_type,document_version,decision) VALUES(?,?,?,?)",student,c.documentType(),c.documentVersion(),c.decision());
        });
    }
}
