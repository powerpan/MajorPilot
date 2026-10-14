package com.ruoyi.majorpilot.pilot;

import com.ruoyi.majorpilot.auth.AuthInputs;
import com.ruoyi.majorpilot.auth.StudentPasswords;
import com.ruoyi.majorpilot.content.TaskContentRepository;
import com.ruoyi.majorpilot.content.TaskPublicationService;
import com.ruoyi.majorpilot.shared.PublicIds;
import com.ruoyi.system.service.ISysConfigService;
import java.util.*;
import org.springframework.boot.*;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component @Profile("pilot")
public class PilotBootstrap implements ApplicationRunner {
    private final JdbcTemplate db;private final TransactionTemplate tx;private final Environment env;
    private final StudentPasswords passwords;private final TaskContentRepository content;
    private final TaskPublicationService publication;private final ISysConfigService configs;
    public PilotBootstrap(JdbcTemplate db,TransactionTemplate tx,Environment env,StudentPasswords passwords,TaskContentRepository content,TaskPublicationService publication,ISysConfigService configs){this.db=db;this.tx=tx;this.env=env;this.passwords=passwords;this.content=content;this.publication=publication;this.configs=configs;}
    @Override public void run(ApplicationArguments args){
        publication.installEngineeringPreviews();
        tx.executeWithoutResult(t->{
            var marker=db.queryForMap("SELECT completed_at FROM mp_pilot_initialization WHERE id=1 FOR UPDATE");
            if(marker.get("completed_at")==null){
                if(db.queryForObject("SELECT COUNT(*) FROM mp_student_account",Integer.class)!=0)throw new IllegalStateException("Pilot initialization requires a new student database");
                Set<String> unique=new HashSet<>();
                for(int i=1;i<=5;i++){String secret=env.getRequiredProperty("MP_PILOT_PASSWORD_"+i);AuthInputs.newPassword(secret);if(secret.length()<24||!unique.add(secret))throw new IllegalStateException("Independent strong pilot passwords required");String email="pilot0"+i+"@majorpilot.invalid",id=PublicIds.next();
                    db.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash,status) VALUES(?,?,?,?,'ACTIVE')",id,email,email,passwords.hash(secret));
                    db.update("INSERT INTO mp_pilot_account(student_id,account_slot) SELECT id,? FROM mp_student_account WHERE public_id=?",i,id);
                }
                String admin=env.getRequiredProperty("MP_PILOT_ADMIN_PASSWORD");if(admin.length()<16||admin.length()>20||unique.contains(admin))throw new IllegalStateException("Independent pilot operator password required");
                db.update("UPDATE sys_user SET password=?,pwd_update_date=UTC_TIMESTAMP(),status='0' WHERE user_id=1",new BCryptPasswordEncoder().encode(admin));
                db.update("UPDATE sys_user SET status='1' WHERE user_id<>1");
                db.update("UPDATE mp_pilot_initialization SET completed_at=UTC_TIMESTAMP(3) WHERE id=1");
            }
            if(db.queryForObject("SELECT COUNT(*) FROM mp_pilot_account",Integer.class)!=5)throw new IllegalStateException("Pilot membership invariant violated; refusing to recreate accounts");
            for(String id:List.of("01JA2000000000000000000001","01JD2000000000000000000001","01JB2000000000000000000001")){
                var bundle=content.bundles().stream().filter(b->id.equals(b.manifest().path("taskVersionId").asText())).findFirst().orElseThrow();
                var task=db.queryForMap("SELECT id,manifest_sha256 FROM mp_task_version WHERE public_id=? AND status='REVIEW' AND version_code='2.0.0'",id);
                if(!bundle.manifestSha256().equals(task.get("manifest_sha256")))throw new IllegalStateException("Pilot content integrity failed");
                var existing=db.queryForList("SELECT manifest_sha256 FROM mp_pilot_task_release WHERE task_version_id=?",task.get("id"));
                if(existing.isEmpty())db.update("INSERT INTO mp_pilot_task_release(task_version_id,manifest_sha256) VALUES(?,?)",task.get("id"),bundle.manifestSha256());
                else if(!bundle.manifestSha256().equals(existing.getFirst().get("manifest_sha256")))throw new IllegalStateException("Pilot release must not overwrite prior authorization");
            }
            db.update("UPDATE sys_config SET config_value='false' WHERE config_key IN ('sys.account.registerUser','sys.account.captchaEnabled')");
        });
        configs.resetConfigCache();
    }
}
