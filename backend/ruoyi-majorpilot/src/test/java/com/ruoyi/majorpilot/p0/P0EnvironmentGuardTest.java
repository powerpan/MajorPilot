package com.ruoyi.majorpilot.p0;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.beans.factory.support.GenericBeanDefinition;
import org.springframework.mock.env.MockEnvironment;

class P0EnvironmentGuardTest {
    private MockEnvironment environment() {
        return new MockEnvironment()
            .withProperty("MP_DB_URL","jdbc:mysql://127.0.0.1:13306/majorpilot?serverTimezone=UTC")
            .withProperty("spring.datasource.druid.master.url","jdbc:mysql://127.0.0.1:13306/majorpilot?serverTimezone=UTC")
            .withProperty("spring.flyway.url","jdbc:mysql://127.0.0.1:13306/majorpilot?serverTimezone=UTC")
            .withProperty("spring.datasource.druid.master.username","majorpilot")
            .withProperty("spring.flyway.user","majorpilot")
            .withProperty("MP_DB_PASSWORD","synthetic-only")
            .withProperty("spring.datasource.druid.master.password","synthetic-only")
            .withProperty("spring.flyway.password","synthetic-only")
            .withProperty("server.address","127.0.0.1").withProperty("server.port","18080")
            .withProperty("MP_ADMIN_TOKEN_SECRET","synthetic-admin-secret-at-least-32-characters")
            .withProperty("MP_CSRF_SECRET","synthetic-csrf-secret-at-least-32-characters");
    }
    @Test void dedicatedConfigurationPassesAndOrdersMigrationBeforeMyBatis() {
        var beans=new DefaultListableBeanFactory();beans.registerBeanDefinition("sqlSessionFactory",new GenericBeanDefinition());
        assertDoesNotThrow(()->P0EnvironmentGuard.p0ValidateEffectiveConfiguration(environment()).postProcessBeanFactory(beans));
        assertArrayEquals(new String[]{"flywayInitializer"},beans.getBeanDefinition("sqlSessionFactory").getDependsOn());
    }
    @Test void defaultsOrRemoteExposureFailBeforeDatasourceCreation() {
        for(String[] override:new String[][]{{"spring.datasource.druid.master.username","root"},{"spring.datasource.druid.master.url","jdbc:mysql://localhost:3306/ry-vue"},{"server.address","0.0.0.0"}}) {
            var env=environment().withProperty(override[0],override[1]);
            assertThrows(IllegalStateException.class,()->P0EnvironmentGuard.p0ValidateEffectiveConfiguration(env).postProcessBeanFactory(new DefaultListableBeanFactory()));
        }
    }
    @Test void identicalAdminAndStudentSigningMaterialIsRejected() {
        var env=environment();env.withProperty("MP_CSRF_SECRET",env.getProperty("MP_ADMIN_TOKEN_SECRET"));
        assertThrows(IllegalStateException.class,()->P0EnvironmentGuard.p0ValidateEffectiveConfiguration(env).postProcessBeanFactory(new DefaultListableBeanFactory()));
    }
}
