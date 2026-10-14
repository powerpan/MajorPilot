package com.ruoyi.majorpilot.acceptance;

import com.ruoyi.majorpilot.shared.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service @Profile({"local","pilot"})
public final class LocalProductAccess {
    private final JdbcTemplate db;
    private final boolean enabled;
    @org.springframework.beans.factory.annotation.Value("${majorpilot.pilot.content-enabled:false}") private boolean pilot;
    public LocalProductAccess(JdbcTemplate db,@Value("${MP_LOCAL_PRODUCT_ENABLED:false}") boolean enabled){this.db=db;this.enabled=enabled;}
    public boolean enabled(){return enabled||pilot;}
    public void requireEnabled(){if(!enabled)throw new ApiException(404,"LOCAL_PRODUCT_DISABLED");}
    /** Persisted provenance remains readable when new local starts are disabled. */
    public static String pinnedSql(String alias){
        if(alias==null||!alias.matches("[a-z][a-z0-9_]*"))throw new IllegalArgumentException("SQL alias");
        return "(EXISTS (SELECT 1 FROM mp_local_task_release lr WHERE lr.task_version_id="+alias+".id AND lr.manifest_sha256="+alias+".manifest_sha256 AND lr.authority_code='PROJECT_OWNER_REQUEST') OR "+pilotSql(alias)+")";
    }
    private static String pilotSql(String alias){if(alias==null||!alias.matches("[a-z][a-z0-9_]*"))throw new IllegalArgumentException("SQL alias");return "EXISTS (SELECT 1 FROM mp_pilot_task_release pr WHERE pr.task_version_id="+alias+".id AND pr.manifest_sha256="+alias+".manifest_sha256 AND pr.authority_code='OWNER_INVITATION_PILOT')";}
    public String releasedSql(String alias){return pilot?pilotSql(alias):enabled?pinnedSql(alias):"FALSE";}
    public boolean canStart(long task){return db.queryForObject("SELECT COUNT(*) FROM mp_task_version t WHERE t.id=? AND (t.status='PUBLISHED' OR (t.content_kind='MAJOR' AND t.status='REVIEW' AND "+releasedSql("t")+"))",Integer.class,task)==1;}
}
