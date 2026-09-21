package com.ruoyi.majorpilot.acceptance;

import com.ruoyi.majorpilot.shared.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service @Profile("local")
public final class LocalProductAccess {
    private final JdbcTemplate db;
    private final boolean enabled;
    public LocalProductAccess(JdbcTemplate db,@Value("${MP_LOCAL_PRODUCT_ENABLED:false}") boolean enabled){this.db=db;this.enabled=enabled;}
    public boolean enabled(){return enabled;}
    public void requireEnabled(){if(!enabled)throw new ApiException(404,"LOCAL_PRODUCT_DISABLED");}
    /** Persisted provenance remains readable when new local starts are disabled. */
    public static String pinnedSql(String alias){
        if(alias==null||!alias.matches("[a-z][a-z0-9_]*"))throw new IllegalArgumentException("SQL alias");
        return "EXISTS (SELECT 1 FROM mp_local_task_release lr WHERE lr.task_version_id="+alias+".id AND lr.manifest_sha256="+alias+".manifest_sha256 AND lr.authority_code='PROJECT_OWNER_REQUEST')";
    }
    public String releasedSql(String alias){return enabled?pinnedSql(alias):"FALSE";}
    public boolean canStart(long task){return db.queryForObject("SELECT COUNT(*) FROM mp_task_version t WHERE t.id=? AND (t.status='PUBLISHED' OR (t.content_kind='MAJOR' AND t.status='REVIEW' AND "+releasedSql("t")+"))",Integer.class,task)==1;}
}
