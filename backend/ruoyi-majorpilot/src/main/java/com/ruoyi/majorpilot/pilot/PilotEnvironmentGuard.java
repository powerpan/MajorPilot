package com.ruoyi.majorpilot.pilot;

import java.net.URI;
import java.util.*;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

/** Fail before datasource creation, not after an accidental connection or migration. */
@Configuration @Profile("pilot")
public class PilotEnvironmentGuard {
    @Bean static BeanFactoryPostProcessor pilotConfiguration(Environment env) {
        return factory->{
            validate(env);
            if(factory.containsBeanDefinition("sqlSessionFactory"))factory.getBeanDefinition("sqlSessionFactory").setDependsOn("flywayInitializer");
        };
    }
    static void validate(Environment env) {
        require(Set.of(env.getActiveProfiles()).equals(Set.of("pilot")));
        String url=env.getProperty("MP_DB_URL","");
        require(url.matches("jdbc:mysql://127\\.0\\.0\\.1:13360/majorpilot_pilot\\?.+")&&!url.contains("autoDeserialize=true")&&!url.contains("allowLoadLocalInfile=true"));
        same(env,"spring.datasource.druid.master.url",url);same(env,"spring.flyway.url",url);
        same(env,"MP_DB_USERNAME","majorpilot_pilot");same(env,"spring.datasource.druid.master.username","majorpilot_pilot");same(env,"spring.flyway.user","majorpilot_pilot");
        String db=env.getProperty("MP_DB_PASSWORD","");same(env,"spring.datasource.druid.master.password",db);same(env,"spring.flyway.password",db);
        String admin=env.getProperty("MP_ADMIN_TOKEN_SECRET",""),csrf=env.getProperty("MP_CSRF_SECRET",""),redis=env.getProperty("MP_REDIS_PASSWORD","");
        var secrets=List.of(db,admin,csrf,redis);require(secrets.stream().allMatch(s->s.matches("[A-Za-z0-9_-]{32,128}"))&&new HashSet<>(secrets).size()==4);
        same(env,"token.secret",admin);same(env,"server.address","127.0.0.1");same(env,"server.port","18230");
        same(env,"server.forward-headers-strategy","native");same(env,"server.tomcat.remoteip.internal-proxies","127\\.0\\.0\\.1");
        same(env,"spring.data.redis.host","127.0.0.1");same(env,"spring.data.redis.port","16390");same(env,"spring.data.redis.database","0");same(env,"spring.data.redis.password",redis);
        for(String key:List.of("MP_EXPERIENCE_AI_ENABLED","MP_CONTENT_PREVIEW_ENABLED","MP_P2_DEMO_ENABLED","MP_LOCAL_PRODUCT_ENABLED"))require(!env.getProperty(key,Boolean.class,false));
        same(env,"majorpilot.pilot.mail-disabled","true");same(env,"majorpilot.pilot.content-enabled","true");same(env,"spring.flyway.clean-disabled","true");same(env,"spring.flyway.baseline-on-migrate","false");
        same(env,"springdoc.api-docs.enabled","false");same(env,"springdoc.swagger-ui.enabled","false");
        URI student=origin(env.getProperty("MP_STUDENT_ORIGIN","")),executor=origin(env.getProperty("MP_EXECUTOR_ORIGIN",""));
        require(!student.getHost().equals(executor.getHost()));
        same(env,"MP_DATA_DIR","/opt/majorpilot/data");same(env,"MP_PRIVATE_EXPORT_ROOT","/opt/majorpilot/data/private-exports");
    }
    private static URI origin(String value){try{var uri=URI.create(value);require("https".equals(uri.getScheme())&&uri.getHost()!=null&&uri.getHost().contains(".")&&uri.getRawUserInfo()==null&&uri.getPort()==-1&&uri.getRawPath().isEmpty()&&uri.getRawQuery()==null&&uri.getRawFragment()==null);return uri;}catch(RuntimeException e){throw invalid();}}
    private static void same(Environment env,String key,String expected){require(expected.equals(env.getProperty(key)));}
    private static void require(boolean value){if(!value)throw invalid();}
    private static IllegalStateException invalid(){return new IllegalStateException("Pilot effective configuration rejected; values suppressed");}
}
