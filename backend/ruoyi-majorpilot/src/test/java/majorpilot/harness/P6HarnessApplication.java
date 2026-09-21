package majorpilot.harness;

import com.ruoyi.majorpilot.p0.P0EnvironmentGuard;
import com.ruoyi.majorpilot.p0.P0Bootstrap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.core.env.Environment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

/** Test-source-only HTTP assembly: real product security, transactions and controllers. */
@SpringBootConfiguration
@EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
@ComponentScan(basePackages = {"com.ruoyi", "majorpilot.harness"}, excludeFilters = {
    @ComponentScan.Filter(type = FilterType.REGEX, pattern = "com\\.ruoyi\\.RuoYiApplication"),
    @ComponentScan.Filter(type = FilterType.REGEX, pattern = "com\\.ruoyi\\.majorpilot\\.report\\.ReportJobs"),
    @ComponentScan.Filter(type = FilterType.REGEX, pattern = "com\\.ruoyi\\.majorpilot\\.privacy\\.(PrivacyJobs|PersonalExportWriter)"),
    @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {P0EnvironmentGuard.class, P0Bootstrap.class})
})
public class P6HarnessApplication {
    @Bean P7HarnessPrivacyCheckpoints privacyCheckpoints(org.springframework.jdbc.core.JdbcTemplate db,
            com.fasterxml.jackson.databind.ObjectMapper mapper,Environment environment) {
        return new P7HarnessPrivacyCheckpoints(db,mapper,environment);
    }
    @Bean com.ruoyi.majorpilot.privacy.PersonalExportWriter personalExportWriter(org.springframework.jdbc.core.JdbcTemplate db,
            com.fasterxml.jackson.databind.ObjectMapper mapper,P7HarnessPrivacyCheckpoints checkpoints) {
        return new P7HarnessPersonalExportWriter(db,mapper,checkpoints);
    }
    @Bean com.ruoyi.majorpilot.privacy.PrivacyJobs privacyJobs(com.ruoyi.majorpilot.privacy.PrivacyStore store,
            com.ruoyi.majorpilot.privacy.PrivateObjectStore files,com.ruoyi.majorpilot.privacy.PersonalExportWriter writer,
            com.ruoyi.majorpilot.privacy.AccountDeletionStages deletion,P7HarnessPrivacyCheckpoints checkpoints) {
        return new P7HarnessPrivacyJobs(store,files,writer,deletion,checkpoints);
    }
    @Bean
    com.ruoyi.majorpilot.report.ReportJobs reportJobs(com.ruoyi.majorpilot.report.ReportStore store,
            com.ruoyi.majorpilot.report.core.ReportCore core,com.ruoyi.majorpilot.report.ReportCoordinator coordinator,
            com.ruoyi.majorpilot.integration.ai.ReportGateway gateway,Environment environment) {
        return new P6HarnessReportJobs(store,core,coordinator,gateway,environment);
    }
    public static void main(String[] args) {
        if (args.length != 0) throw rejected();
        var environment = new StandardEnvironment();
        // Highest precedence, including over application-local's imported P0 defaults.
        environment.getPropertySources().addFirst(new MapPropertySource("p6-test-only-boundary", properties()));
        var application = new SpringApplication(P6HarnessApplication.class);
        application.setEnvironment(environment);
        application.setAdditionalProfiles("local", "p6-harness");
        application.run();
    }

    static Map<String,Object> properties() {
        var result = new LinkedHashMap<String,Object>();
        result.put("spring.profiles.active", "local,p6-harness");
        result.put("server.address", "127.0.0.1");
        result.put("server.port", "18081");
        result.put("MP_STUDENT_ORIGIN", "http://127.0.0.1:15176");
        result.put("MP_PRIVATE_EXPORT_ROOT", "${MP_P6_HARNESS_DIR}/private-exports");
        result.put("spring.datasource.druid.master.url", "${MP_DB_URL}");
        result.put("spring.datasource.druid.master.username", "${MP_DB_USERNAME}");
        result.put("spring.datasource.druid.master.password", "${MP_DB_PASSWORD}");
        result.put("spring.flyway.url", "${MP_DB_URL}");
        result.put("spring.flyway.user", "${MP_DB_USERNAME}");
        result.put("spring.flyway.password", "${MP_DB_PASSWORD}");
        result.put("spring.flyway.clean-disabled", "true");
        result.put("spring.data.redis.host", "127.0.0.1");
        result.put("spring.data.redis.port", "16380");
        result.put("spring.data.redis.database", "14");
        result.put("spring.data.redis.password", "${MP_REDIS_PASSWORD}");
        result.put("spring.mail.host", "127.0.0.1");
        result.put("spring.mail.port", "11025");
        result.put("MP_P2_DEMO_ENABLED", "false");
        result.put("MP_CONTENT_PREVIEW_ENABLED", "false");
        result.put("MP_EXPERIENCE_AI_ENABLED", "false");
        // A test-source-only @Primary gateway has no network code. Exercise the
        // actual AI orchestration path without inheriting any provider key.
        result.put("MP_REPORT_AI_ENABLED", "true");
        result.put("MAJORPILOT_AI_MODE", "fake");
        result.put("majorpilot.p0.worker-enabled", "false");
        result.put("spring.main.banner-mode", "off");
        return Map.copyOf(result);
    }

    @Bean
    static BeanFactoryPostProcessor validateTestBoundary(Environment environment) {
        return factory -> {
            Set<String> profiles = Set.of(environment.getActiveProfiles());
            String url = environment.getProperty("MP_DB_URL", "");
            if (!profiles.equals(Set.of("local", "p6-harness"))
                || !url.equals("jdbc:mysql://127.0.0.1:13306/majorpilot_test?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC")
                || !"majorpilot_p6_test".equals(environment.getProperty("MP_DB_USERNAME"))
                || !url.equals(environment.getProperty("spring.datasource.druid.master.url"))
                || !url.equals(environment.getProperty("spring.flyway.url"))
                || !"majorpilot_p6_test".equals(environment.getProperty("spring.datasource.druid.master.username"))
                || !"majorpilot_p6_test".equals(environment.getProperty("spring.flyway.user"))
                || !Objects.equals(environment.getProperty("MP_DB_PASSWORD"), environment.getProperty("spring.flyway.password"))
                || !Objects.equals(environment.getProperty("MP_DB_PASSWORD"), environment.getProperty("spring.datasource.druid.master.password"))
                || !"127.0.0.1".equals(environment.getProperty("server.address"))
                || !"18081".equals(environment.getProperty("server.port"))
                || !"http://127.0.0.1:15176".equals(environment.getProperty("MP_STUDENT_ORIGIN"))
                || !"127.0.0.1".equals(environment.getProperty("spring.data.redis.host"))
                || !"16380".equals(environment.getProperty("spring.data.redis.port"))
                || !"14".equals(environment.getProperty("spring.data.redis.database"))
                || !"127.0.0.1".equals(environment.getProperty("spring.mail.host"))
                || !"11025".equals(environment.getProperty("spring.mail.port"))
                || !"fake".equals(environment.getProperty("MAJORPILOT_AI_MODE"))
                || !"false".equals(environment.getProperty("MP_P2_DEMO_ENABLED"))
                || !"false".equals(environment.getProperty("MP_CONTENT_PREVIEW_ENABLED"))
                || !"false".equals(environment.getProperty("MP_EXPERIENCE_AI_ENABLED"))
                || !"true".equals(environment.getProperty("MP_REPORT_AI_ENABLED"))) throw rejected();
            for (String name : Set.of("BAILIAN_API_KEY", "DASHSCOPE_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"))
                if (!environment.getProperty(name, "").isBlank()) throw rejected();
            String admin = environment.getProperty("MP_ADMIN_TOKEN_SECRET", ""), csrf = environment.getProperty("MP_CSRF_SECRET", "");
            if (!admin.matches("[a-f0-9]{64}") || !csrf.matches("[a-f0-9]{64}") || admin.equals(csrf)
                || !admin.equals(environment.getProperty("token.secret"))
                || !environment.getProperty("MP_DB_PASSWORD", "").matches("[a-f0-9]{64}")
                || !environment.getProperty("MP_P6_RUN_TAG", "").matches("[a-f0-9]{16}")) throw rejected();
            if (factory.containsBeanDefinition("sqlSessionFactory"))
                factory.getBeanDefinition("sqlSessionFactory").setDependsOn("flywayInitializer");
        };
    }

    private static IllegalStateException rejected() {
        return new IllegalStateException("P6 test harness boundary rejected; configuration values suppressed");
    }
}
