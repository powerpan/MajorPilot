package com.ruoyi.majorpilot.p0;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import com.ruoyi.system.service.ISysConfigService;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.transaction.support.TransactionTemplate;

@Component @Profile({"p0","local"})
public class P0Bootstrap implements ApplicationRunner {
    static final String INITIALIZED="majorpilot.local.security.initialized";
    static final String UPSTREAM_PASSWORD="$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2";
    private final JdbcTemplate jdbc;private final String password;private final ISysConfigService configs;private final TransactionTemplate tx;private final boolean probe;
    public P0Bootstrap(JdbcTemplate jdbc,ISysConfigService configs,@Value("${MP_P0_ADMIN_PASSWORD}") String password,TransactionTemplate tx,Environment env) { validateAdminPassword(password);this.jdbc=jdbc;this.configs=configs;this.password=password;this.tx=tx;this.probe=env.acceptsProfiles(Profiles.of("p0")); }
    static void validateAdminPassword(String password) {
        if(password==null || password.length()<16 || password.length()>20) throw new IllegalArgumentException("MP_P0_ADMIN_PASSWORD must contain 16-20 characters to match the retained RuoYi login contract");
    }
    @Override public void run(ApplicationArguments args) {
        tx.executeWithoutResult(status->{
            String existing=jdbc.queryForObject("SELECT password FROM sys_user WHERE user_id=1 FOR UPDATE",String.class);
            boolean initialized=jdbc.queryForObject("SELECT COUNT(*) FROM sys_config WHERE config_key=?",Integer.class,INITIALIZED)>0;
            // Existing installations already replaced the upstream hash. A missing marker
            // does not authorize replacing an Operator-managed password or account status.
            if(shouldRotate(probe,initialized,existing))jdbc.update("UPDATE sys_user SET password=?,pwd_update_date=UTC_TIMESTAMP(),status='0' WHERE user_id=1",new BCryptPasswordEncoder().encode(password));
            jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=2 AND user_name='ry'");
            if(!initialized)jdbc.update("INSERT INTO sys_config(config_name,config_key,config_value,config_type,create_by,create_time,remark) VALUES('MajorPilot local initialization',?,'v1','Y','majorpilot',UTC_TIMESTAMP(),'One-time local safety initialization; not a password reset policy')",INITIALIZED);
        });
        jdbc.update("UPDATE sys_config SET config_value='false' WHERE config_key IN ('sys.account.registerUser','sys.account.captchaEnabled')");
        // Exact imported upstream menus only; preserve baseline SQL and hide routes
        // denied/deferred by P0 security instead of leaving dead links in the sidebar.
        jdbc.update("UPDATE sys_menu SET status='1',visible='1' WHERE (menu_id=3 AND path='tool') OR (menu_id=4 AND path='http://ruoyi.vip') OR (menu_id=110 AND path='job') OR (menu_id=111 AND path='druid') OR (menu_id=115 AND path='build') OR (menu_id=116 AND path='gen') OR (menu_id=117 AND path='swagger') OR parent_id IN (110,115,116,117)");
        configs.resetConfigCache();
    }
    static boolean shouldRotate(boolean probe,boolean initialized,String currentHash){return probe||!initialized&&UPSTREAM_PASSWORD.equals(currentHash);}
}
