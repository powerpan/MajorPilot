package majorpilot.harness;

import com.ruoyi.common.constant.CacheConstants;
import com.ruoyi.common.core.redis.RedisCache;
import java.util.List;
import java.util.Set;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** Real RuoYi principals, never user/role 1 and never a wildcard permission. */
@Component @Profile("p6-harness")
public final class P6HarnessOperators {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final RedisCache cache;
    private final String tag, password;
    public P6HarnessOperators(JdbcTemplate db, TransactionTemplate tx, RedisCache cache, Environment env) {
        this.db=db; this.tx=tx; this.cache=cache;
        tag=env.getRequiredProperty("MP_P6_RUN_TAG");
        String secret=env.getRequiredProperty("MP_P0_ADMIN_PASSWORD");
        if(!tag.matches("[a-f0-9]{16}") || !secret.matches("[a-f0-9]{64}"))throw rejected();
        password=secret.substring(0,20);
    }
    public static String username(String level,String tag) {
        if(!Set.of("full","limited").contains(level)||!tag.matches("[a-f0-9]{16}"))throw rejected();
        return "p6-"+level+"-"+tag.substring(0,8);
    }
    @EventListener(ApplicationReadyEvent.class)
    public void install() {
        if(!"majorpilot_test".equals(db.queryForObject("SELECT DATABASE()",String.class)))throw rejected();
        tx.executeWithoutResult(ignored->{
            install("full",List.of("majorpilot:report:view","majorpilot:report:regenerate","majorpilot:report:history:view","majorpilot:report:sensitive:view"));
            install("limited",List.of("majorpilot:report:view"));
        });
        // Isolated Redis14 only: preserve the shared baseline configuration rows.
        cache.setCacheObject(CacheConstants.SYS_CONFIG_KEY+"sys.account.captchaEnabled","false");
        cache.setCacheObject(CacheConstants.SYS_CONFIG_KEY+"sys.account.registerUser","false");
    }
    private void install(String level,List<String> permissions) {
        String owner="p6-harness:"+tag, name=username(level,tag), roleKey="p6_"+level+"_"+tag;
        var users=db.queryForList("SELECT user_id,create_by,password,status,del_flag FROM sys_user WHERE user_name=? FOR UPDATE",name);
        if(users.isEmpty())db.update("INSERT INTO sys_user(user_name,nick_name,password,status,del_flag,create_by,create_time,pwd_update_date,remark) VALUES(?,?,?,'0','0',?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),'TEST_FIXTURE only')",name,name,new BCryptPasswordEncoder().encode(password),owner);
        else if(users.size()!=1 || !owner.equals(users.getFirst().get("create_by")) || !"0".equals(users.getFirst().get("status")) || !"0".equals(users.getFirst().get("del_flag")) || !new BCryptPasswordEncoder().matches(password,users.getFirst().get("password").toString()))throw rejected();
        long user=db.queryForObject("SELECT user_id FROM sys_user WHERE user_name=? AND create_by=?",Long.class,name,owner);
        if(user<=2)throw rejected();
        var roles=db.queryForList("SELECT role_id,create_by FROM sys_role WHERE role_key=? FOR UPDATE",roleKey);
        if(roles.isEmpty())db.update("INSERT INTO sys_role(role_name,role_key,role_sort,data_scope,status,del_flag,create_by,create_time,remark) VALUES(?,?,99,'5','0','0',?,UTC_TIMESTAMP(),'TEST_FIXTURE only')",name,roleKey,owner);
        else if(roles.size()!=1 || !owner.equals(roles.getFirst().get("create_by")))throw rejected();
        long role=db.queryForObject("SELECT role_id FROM sys_role WHERE role_key=? AND create_by=?",Long.class,roleKey,owner);
        if(role<=2)throw rejected();
        var links=db.queryForList("SELECT role_id FROM sys_user_role WHERE user_id=?",Long.class,user);
        if(links.isEmpty())db.update("INSERT INTO sys_user_role(user_id,role_id) VALUES(?,?)",user,role);
        else if(!links.equals(List.of(role)))throw rejected();
        for(String permission:permissions) {
            var menus=db.queryForList("SELECT menu_id FROM sys_menu WHERE create_by=? AND perms=?",Long.class,owner,permission);
            if(menus.isEmpty())db.update("INSERT INTO sys_menu(menu_name,parent_id,order_num,path,menu_type,visible,status,perms,create_by,create_time,remark) VALUES('TEST_FIXTURE',0,0,'','F','1','0',?,?,UTC_TIMESTAMP(),'TEST_FIXTURE only')",permission,owner);
            else if(menus.size()!=1)throw rejected();
            long menu=db.queryForObject("SELECT menu_id FROM sys_menu WHERE create_by=? AND perms=?",Long.class,owner,permission);
            if(db.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=? AND menu_id=?",Long.class,role,menu)==0)
                db.update("INSERT INTO sys_role_menu(role_id,menu_id) VALUES(?,?)",role,menu);
        }
        var actual=db.queryForList("SELECT m.perms FROM sys_role_menu rm JOIN sys_menu m ON m.menu_id=rm.menu_id WHERE rm.role_id=?",String.class,role);
        if(actual.size()!=permissions.size() || !Set.copyOf(actual).equals(Set.copyOf(permissions)))throw rejected();
    }
    private static IllegalStateException rejected(){return new IllegalStateException("Harness operator scope rejected; values suppressed");}
}
