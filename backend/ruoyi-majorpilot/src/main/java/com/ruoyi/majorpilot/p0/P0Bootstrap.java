package com.ruoyi.majorpilot.p0;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import com.ruoyi.system.service.ISysConfigService;

@Component @Profile({"p0","local"})
public class P0Bootstrap implements ApplicationRunner {
    private final JdbcTemplate jdbc;private final String password;private final ISysConfigService configs;
    public P0Bootstrap(JdbcTemplate jdbc,ISysConfigService configs,@Value("${MP_P0_ADMIN_PASSWORD}") String password) { validateAdminPassword(password);this.jdbc=jdbc;this.configs=configs;this.password=password; }
    static void validateAdminPassword(String password) {
        if(password==null || password.length()<16 || password.length()>20) throw new IllegalArgumentException("MP_P0_ADMIN_PASSWORD must contain 16-20 characters to match the retained RuoYi login contract");
    }
    @Override public void run(ApplicationArguments args) {
        jdbc.update("UPDATE sys_user SET password=?,pwd_update_date=UTC_TIMESTAMP(),status='0' WHERE user_id=1",new BCryptPasswordEncoder().encode(password));
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id<>1");
        jdbc.update("UPDATE sys_config SET config_value='false' WHERE config_key IN ('sys.account.registerUser','sys.account.captchaEnabled')");
        // Exact imported upstream menus only; preserve baseline SQL and hide routes
        // denied/deferred by P0 security instead of leaving dead links in the sidebar.
        jdbc.update("UPDATE sys_menu SET status='1',visible='1' WHERE (menu_id=3 AND path='tool') OR (menu_id=4 AND path='http://ruoyi.vip') OR (menu_id=110 AND path='job') OR (menu_id=111 AND path='druid') OR (menu_id=115 AND path='build') OR (menu_id=116 AND path='gen') OR (menu_id=117 AND path='swagger') OR parent_id IN (110,115,116,117)");
        configs.resetConfigCache();
    }
}
