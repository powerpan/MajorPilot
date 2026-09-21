package com.ruoyi.majorpilot.acceptance;

import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;

/** A product grant never rewrites frozen evidence or the original run mode. */
public final class ProductEligibility {
    private ProductEligibility() {}
    private static String alias(String value) {
        if(value==null||!value.matches("[a-z][a-z0-9_]*"))throw new IllegalArgumentException("SQL alias");
        return value;
    }
    private static String match(String run) {
        String r=alias(run);
        return "a.experience_run_id="+r+".id AND a.student_id="+r+".student_id AND a.task_version_id="+r+".task_version_id AND a.decision_profile_id="+r+".decision_profile_id AND a.closed_input_sha256="+r+".closed_input_sha256 AND a.original_run_mode="+r+".run_mode AND a.original_run_mode='REVIEW_PREVIEW' AND a.authority_code='PROJECT_OWNER_REQUEST' AND "+r+".content_kind='MAJOR' AND "+r+".status='CLOSED' AND a.task_manifest_sha256=t.manifest_sha256 AND a.task_manifest_sha256=JSON_UNQUOTE(JSON_EXTRACT("+r+".closed_input_manifest_json,'$.taskManifestSha256'))";
    }
    public static String sql(String run) {
        String r=alias(run);
        return "("+r+".content_kind='MAJOR' AND ("+r+".run_mode='STANDARD' OR EXISTS (SELECT 1 FROM mp_run_product_adoption a JOIN mp_task_version t ON t.id=a.task_version_id WHERE "+match(r)+")))";
    }
    public static boolean eligible(JdbcTemplate db,long student,long run) {
        return db.queryForObject("SELECT COUNT(*) FROM mp_experience_run r WHERE r.student_id=? AND r.id=? AND "+sql("r"),Integer.class,student,run)==1;
    }
    public static Map<String,Object> authorization(JdbcTemplate db,long student,long run) {
        var rows=db.queryForList("SELECT a.* FROM mp_run_product_adoption a JOIN mp_experience_run r ON r.id=a.experience_run_id JOIN mp_task_version t ON t.id=a.task_version_id WHERE r.student_id=? AND r.id=? AND "+match("r"),student,run);
        return rows.isEmpty()?null:rows.getFirst();
    }
}
