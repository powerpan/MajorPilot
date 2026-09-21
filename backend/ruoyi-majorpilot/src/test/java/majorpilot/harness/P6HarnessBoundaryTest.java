package majorpilot.harness;

import static org.junit.jupiter.api.Assertions.*;
import com.ruoyi.majorpilot.integration.ai.ReportGateway;
import com.ruoyi.majorpilot.report.core.ReportCore;
import com.ruoyi.majorpilot.report.core.ReportModels.GenerationMode;
import com.ruoyi.majorpilot.report.core.ReportTestFixtures;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.env.MockEnvironment;

class P6HarnessBoundaryTest {
    @TempDir Path temporary;
    private MockEnvironment valid() {
        var env=new MockEnvironment();env.setActiveProfiles("local","p6-harness");
        env.getPropertySources().addFirst(new MapPropertySource("fixed",P6HarnessApplication.properties()));
        return env.withProperty("MP_DB_URL","jdbc:mysql://127.0.0.1:13306/majorpilot_test?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC")
            .withProperty("MP_DB_USERNAME","majorpilot_p6_test").withProperty("MP_DB_PASSWORD","1".repeat(64))
            .withProperty("MP_ADMIN_TOKEN_SECRET","2".repeat(64)).withProperty("MP_CSRF_SECRET","3".repeat(64))
            .withProperty("token.secret","${MP_ADMIN_TOKEN_SECRET}").withProperty("MP_P6_RUN_TAG","0123456789abcdef");
    }
    @Test void validBoundaryPassesBeforeOrdinaryBeanInstantiation() {
        try(var context=new GenericApplicationContext()) {
            var env=valid();context.setEnvironment(env);
            context.addBeanFactoryPostProcessor(P6HarnessApplication.validateTestBoundary(env));
            var instantiated=new AtomicBoolean();context.registerBean("dataSource",Object.class,()->{instantiated.set(true);return new Object();});
            context.refresh();assertTrue(instantiated.get());
        }
    }
    @Test void wrongDatabaseAdditionalJdbcOptionsProviderKeyAndExtraProfileFailBeforeAnyConnection() {
        for(String fault:List.of("database","jdbcOption","provider","profile","secret")) {
            var env=valid();switch(fault){
                case "database"->env.setProperty("MP_DB_URL","jdbc:mysql://127.0.0.1:13306/majorpilot?x=1");
                case "jdbcOption"->env.setProperty("MP_DB_URL",env.getProperty("MP_DB_URL")+"&allowLoadLocalInfile=true");
                case "provider"->env.setProperty("BAILIAN_API_KEY","SECRET_SENTINEL");
                case "profile"->env.setActiveProfiles("local","p6-harness","p0");
                default->env.setProperty("MP_CSRF_SECRET",env.getProperty("MP_ADMIN_TOKEN_SECRET"));
            }
            var instantiated=new AtomicBoolean();
            try(var context=new GenericApplicationContext()) {
                context.setEnvironment(env);context.addBeanFactoryPostProcessor(P6HarnessApplication.validateTestBoundary(env));
                context.registerBean("dataSource",Object.class,()->{instantiated.set(true);return new Object();});
                var failure=assertThrows(RuntimeException.class,context::refresh);assertFalse(instantiated.get());
                assertFalse(failure.getMessage().contains("SECRET_SENTINEL"));
            }
        }
    }
    @Test void replayUsesRealCoreAndSimulatedOneAttemptWithBoundedFaultModes() throws Exception {
        var dir=temporary.resolve("data/p6-harness");Files.createDirectories(dir);
        var mapper=ReportTestFixtures.JSON;var core=new ReportCore(mapper);
        var gateway=new P6HarnessGateway(mapper,core,new MockEnvironment().withProperty("MP_P6_HARNESS_DIR",dir.toString()));
        var input=ReportTestFixtures.experience("AI",true);var catalog=core.compile(input);var safe=core.modelInput(catalog);
        var initial=new ReportGateway.Attempt("test-invocation",ReportGateway.Stage.INITIAL,safe,List.of(),5000);
        Files.writeString(dir.resolve("gateway-control.json"),"{\"mode\":\"PASS\"}");
        var result=gateway.attempt(initial);assertEquals(ReportGateway.Status.PROPOSAL_RECEIVED,result.status());
        assertEquals("TEST_REPLAY",result.telemetry().provider());assertEquals(1,result.telemetry().httpAttempts());
        assertEquals(core.hash(safe.content()),result.telemetry().inputSha256());assertTrue(core.validate(catalog,result.proposal(),GenerationMode.AI).valid());
        Files.writeString(dir.resolve("gateway-control.json"),"{\"mode\":\"INVALID_INITIAL\"}");
        assertEquals(ReportGateway.Status.INVALID_OUTPUT,gateway.attempt(initial).status());
        assertEquals(ReportGateway.Status.PROPOSAL_RECEIVED,gateway.attempt(new ReportGateway.Attempt("repair",ReportGateway.Stage.REPAIR,safe,List.of(),5000)).status());
        Files.writeString(dir.resolve("gateway-control.json"),"{\"mode\":\"UPSTREAM_429\"}");
        assertEquals("AI_RATE_LIMITED",gateway.attempt(initial).safeErrorCode());
        Files.writeString(dir.resolve("gateway-control.json"),"{\"mode\":\"HOLD_REPAIR\"}");
        assertEquals(ReportGateway.Status.INVALID_OUTPUT,gateway.attempt(initial).status());
        assertEquals("AI_TIMEOUT",gateway.attempt(new ReportGateway.Attempt("repair",ReportGateway.Stage.REPAIR,safe,List.of(),1)).safeErrorCode());
        Files.writeString(dir.resolve("gateway-control.json"),"{\"mode\":\"AI_OFF\"}");assertFalse(gateway.available());
        Files.writeString(dir.resolve("gateway-control.json"),"{\"mode\":\"PASS\",\"payload\":\"SECRET_SENTINEL\"}");
        var failure=assertThrows(IllegalStateException.class,()->gateway.attempt(initial));assertFalse(failure.getMessage().contains("SECRET_SENTINEL"));
    }
    @Test void operatorNamesFitRealRuoyiLoginContractAndCannotBecomeAdmin() {
        for(String level:List.of("full","limited")){String name=P6HarnessOperators.username(level,"0123456789abcdef");assertTrue(name.length()<=20);assertTrue(name.startsWith("p6-"));assertNotEquals("admin",name);}
        assertThrows(IllegalStateException.class,()->P6HarnessOperators.username("admin","0123456789abcdef"));
    }
}
