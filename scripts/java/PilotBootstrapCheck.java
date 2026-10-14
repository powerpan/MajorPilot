import java.lang.reflect.Proxy;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.pilot.PilotBootstrap;
import com.ruoyi.majorpilot.auth.StudentPasswords;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.acceptance.LocalProductAccess;
import com.ruoyi.system.service.ISysConfigService;
import org.springframework.core.env.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;

/** Called only in the fresh, randomly named disposable migration schema. No HTTP/model calls. */
public final class PilotBootstrapCheck {
    public static Map<String,Object> run(String url,String account,String password) throws Exception {
        if(!url.matches("jdbc:mysql://127\\.0\\.0\\.1:13306/majorpilotmigration[0-9a-f]{16}\\?.+"))throw new IllegalStateException("Unexpected fixture database");
        var ds=new DriverManagerDataSource(url,account,password);var db=new JdbcTemplate(ds);var tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        var env=new StandardEnvironment();Map<String,Object> values=new HashMap<>();
        for(int i=1;i<=5;i++)values.put("MP_PILOT_PASSWORD_"+i,"synthetic pilot fixture passphrase "+i);
        values.put("MP_PILOT_ADMIN_PASSWORD","FixtureAdminPass042!");
        env.getPropertySources().addFirst(new MapPropertySource("synthetic-pilot-fixture",values));
        var mapper=new ObjectMapper();var repository=new TaskContentRepository(mapper);
        var publication=new TaskPublicationService(db,tx,repository,mapper,false,false);
        publication.localProductAccess(new LocalProductAccess(db,true));
        var configs=(ISysConfigService)Proxy.newProxyInstance(ISysConfigService.class.getClassLoader(),new Class[]{ISysConfigService.class},(proxy,method,args)->{if(!method.getName().equals("resetConfigCache"))throw new IllegalStateException("Unexpected configuration call");return null;});
        var passwords=new StudentPasswords();var bootstrap=new PilotBootstrap(db,tx,env,passwords,repository,publication,configs);
        bootstrap.run(null);
        require(db.queryForObject("SELECT COUNT(*) FROM mp_pilot_account",Integer.class)==5);
        require(db.queryForObject("SELECT COUNT(*) FROM mp_student_account WHERE email_verified_at IS NOT NULL",Integer.class)==0);
        require(db.queryForObject("SELECT COUNT(*) FROM mp_consent_record",Integer.class)==0);
        require(db.queryForObject("SELECT COUNT(*) FROM mp_pilot_task_release p JOIN mp_task_version t ON t.id=p.task_version_id WHERE t.status='REVIEW' AND t.manifest_sha256=p.manifest_sha256",Integer.class)==3);
        String hash=db.queryForObject("SELECT password_hash FROM mp_student_account WHERE email_normalized='pilot01@majorpilot.invalid'",String.class);
        require(passwords.matches(values.get("MP_PILOT_PASSWORD_1").toString(),hash));
        values.put("MP_PILOT_PASSWORD_1","a changed fixture must not reset passwords");bootstrap.run(null);
        require(hash.equals(db.queryForObject("SELECT password_hash FROM mp_student_account WHERE email_normalized='pilot01@majorpilot.invalid'",String.class)));
        db.update("UPDATE mp_student_account SET status='DELETED',password_hash=NULL,email_normalized='deleted-fixture@majorpilot.invalid' WHERE email_normalized='pilot05@majorpilot.invalid'");
        bootstrap.run(null);
        require(db.queryForObject("SELECT COUNT(*) FROM mp_student_account",Integer.class)==5);
        require(db.queryForObject("SELECT COUNT(*) FROM mp_student_account WHERE status='DELETED'",Integer.class)==1);
        require(db.queryForObject("SELECT COUNT(*) FROM mp_student_account WHERE email_normalized='pilot05@majorpilot.invalid'",Integer.class)==0);
        return Map.of("fiveAccounts",true,"noFabricatedEmailVerificationOrConsent",true,"reviewContentPinned",true,"restartDoesNotResetPasswords",true,"deletedInvitationNotRecreated",true);
    }
    private static void require(boolean value){if(!value)throw new IllegalStateException("Pilot fixture assertion failed");}
}
