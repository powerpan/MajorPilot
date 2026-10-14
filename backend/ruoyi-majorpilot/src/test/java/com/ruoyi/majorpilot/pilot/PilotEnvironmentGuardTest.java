package com.ruoyi.majorpilot.pilot;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class PilotEnvironmentGuardTest {
    MockEnvironment valid(){
        var env=new MockEnvironment();env.setActiveProfiles("pilot");
        String url="jdbc:mysql://127.0.0.1:13360/majorpilot_pilot?serverTimezone=UTC",db="d".repeat(40),redis="r".repeat(40),admin="a".repeat(40),csrf="c".repeat(40);
        Map.ofEntries(Map.entry("MP_DB_URL",url),Map.entry("spring.datasource.druid.master.url",url),Map.entry("spring.flyway.url",url),Map.entry("MP_DB_USERNAME","majorpilot_pilot"),Map.entry("spring.datasource.druid.master.username","majorpilot_pilot"),Map.entry("spring.flyway.user","majorpilot_pilot"),Map.entry("MP_DB_PASSWORD",db),Map.entry("spring.datasource.druid.master.password",db),Map.entry("spring.flyway.password",db),Map.entry("MP_REDIS_PASSWORD",redis),Map.entry("spring.data.redis.password",redis),Map.entry("MP_ADMIN_TOKEN_SECRET",admin),Map.entry("token.secret",admin),Map.entry("MP_CSRF_SECRET",csrf),Map.entry("server.address","127.0.0.1"),Map.entry("server.port","18230"),Map.entry("server.forward-headers-strategy","native"),Map.entry("server.tomcat.remoteip.internal-proxies","127\\.0\\.0\\.1"),Map.entry("spring.data.redis.host","127.0.0.1"),Map.entry("spring.data.redis.port","16390"),Map.entry("spring.data.redis.database","0"),Map.entry("majorpilot.pilot.mail-disabled","true"),Map.entry("majorpilot.pilot.content-enabled","true"),Map.entry("spring.flyway.clean-disabled","true"),Map.entry("spring.flyway.baseline-on-migrate","false"),Map.entry("springdoc.api-docs.enabled","false"),Map.entry("springdoc.swagger-ui.enabled","false"),Map.entry("MP_STUDENT_ORIGIN","https://student.example.org"),Map.entry("MP_EXECUTOR_ORIGIN","https://executor.example.org"),Map.entry("MP_DATA_DIR","/opt/majorpilot/data"),Map.entry("MP_PRIVATE_EXPORT_ROOT","/opt/majorpilot/data/private-exports")).forEach(env::setProperty);
        return env;
    }
    @Test void acceptsOnlyTheIsolatedEffectiveConfiguration(){assertDoesNotThrow(()->PilotEnvironmentGuard.validate(valid()));}
    @Test void rejectsSharedServicesDebuggingMixedProfilesAndNonTls(){
        for(var entry:Map.of("spring.data.redis.port","6379","spring.datasource.druid.master.url","jdbc:mysql://127.0.0.1:3306/other","server.address","0.0.0.0","server.tomcat.remoteip.internal-proxies",".*","MP_EXPERIENCE_AI_ENABLED","true","MP_LOCAL_PRODUCT_ENABLED","true","springdoc.api-docs.enabled","true","MP_STUDENT_ORIGIN","http://student.example.org","MP_EXECUTOR_ORIGIN","https://student.example.org","spring.flyway.clean-disabled","false").entrySet())assertThrows(IllegalStateException.class,()->PilotEnvironmentGuard.validate(valid().withProperty(entry.getKey(),entry.getValue())));
        var mixed=valid();mixed.setActiveProfiles("pilot","local");assertThrows(IllegalStateException.class,()->PilotEnvironmentGuard.validate(mixed));
        assertThrows(IllegalStateException.class,()->PilotEnvironmentGuard.validate(valid().withProperty("MP_CSRF_SECRET","a".repeat(40))));
    }
}
