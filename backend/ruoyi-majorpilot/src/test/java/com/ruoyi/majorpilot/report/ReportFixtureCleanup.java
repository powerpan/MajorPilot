package com.ruoyi.majorpilot.report;
import org.springframework.jdbc.core.JdbcTemplate;
/** Exact synthetic owner cleanup; caller has already verified the fixture Student. */
public final class ReportFixtureCleanup {
    private ReportFixtureCleanup(){}
    public static void remove(JdbcTemplate db,long student){
        db.update("DELETE FROM mp_product_event WHERE student_id=?",student);
        db.update("DELETE FROM mp_ai_call WHERE student_id=?",student);
        db.update("DELETE a FROM mp_sensitive_audit a JOIN mp_report r ON r.public_id=a.target_public_id WHERE r.student_id=? AND a.target_type='REPORT'",student);
        db.update("DELETE a FROM mp_sensitive_audit a JOIN mp_report_version v ON v.public_id=a.target_public_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=? AND a.target_type='REPORT_VERSION'",student);
        db.update("UPDATE mp_report SET current_version_id=NULL,generation_target_version_id=NULL WHERE student_id=?",student);
        db.update("DELETE x FROM mp_comparison_source x JOIN mp_report_version v ON v.id=x.comparison_report_version_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        db.update("DELETE x FROM mp_report_claim_evidence x JOIN mp_report_claim c ON c.id=x.report_claim_id JOIN mp_report_version v ON v.id=c.report_version_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        db.update("DELETE c FROM mp_report_claim c JOIN mp_report_version v ON v.id=c.report_version_id JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        db.update("DELETE FROM mp_student_feedback WHERE student_id=?",student);
        db.update("DELETE v FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE r.student_id=?",student);
        db.update("DELETE FROM mp_report WHERE student_id=?",student);
        db.update("DELETE i FROM mp_evidence_item i JOIN mp_evidence_snapshot s ON s.id=i.evidence_snapshot_id WHERE s.student_id=?",student);
        db.update("DELETE FROM mp_evidence_snapshot WHERE student_id=?",student);
        db.update("DELETE FROM mp_background_job WHERE owner_student_id=?",student);
    }
}
