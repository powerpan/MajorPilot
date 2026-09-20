package com.ruoyi.majorpilot.p0;

import java.util.Objects;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

/** Runs before DataSource creation: a configuration precedence mistake must never select a default/user database. */
@Configuration @Profile("p0")
public class P0EnvironmentGuard {
    @Bean static BeanFactoryPostProcessor p0ValidateEffectiveConfiguration(Environment env) {
        return factory -> {
            String expected=env.getProperty("MP_DB_URL");
            if(expected==null || !expected.matches("jdbc:mysql://127\\.0\\.0\\.1:13306/majorpilot\\?.+")
                || !Objects.equals(expected,env.getProperty("spring.datasource.druid.master.url"))
                || !Objects.equals(expected,env.getProperty("spring.flyway.url"))
                || !"majorpilot".equals(env.getProperty("spring.datasource.druid.master.username"))
                || !"majorpilot".equals(env.getProperty("spring.flyway.user"))
                || !Objects.equals(env.getProperty("MP_DB_PASSWORD"),env.getProperty("spring.flyway.password"))
                || !Objects.equals(env.getProperty("MP_DB_PASSWORD"),env.getProperty("spring.datasource.druid.master.password")))
                throw new IllegalStateException("P0 requires the dedicated loopback MajorPilot datasource; effective configuration rejected (values suppressed)");
            if(!"127.0.0.1".equals(env.getProperty("server.address")) || !"18080".equals(env.getProperty("server.port")))
                throw new IllegalStateException("P0 requires loopback port 18080");
            String admin=env.getProperty("MP_ADMIN_TOKEN_SECRET",""),csrf=env.getProperty("MP_CSRF_SECRET","");
            if(admin.length()<32 || csrf.length()<32 || admin.equals(csrf)) throw new IllegalStateException("P0 requires independent strong admin and CSRF secrets");
            // RuoYi creates SqlSessionFactory manually; its @PostConstruct configuration
            // readers must not query upstream tables before Flyway has created the baseline.
            if(factory.containsBeanDefinition("sqlSessionFactory")) factory.getBeanDefinition("sqlSessionFactory").setDependsOn("flywayInitializer");
        };
    }
}
