package com.ruoyi.majorpilot.integration.ai;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Explicit paid opt-in only. The durable attempt marker prevents accidental repeat during reruns. */
@EnabledIfEnvironmentVariable(named="MP_RUN_BAILIAN_TEST",matches="true")
class BailianLiveP0Test {
    @Test void oneSyntheticRequestViaServerAdapter() throws Exception {
        String guard=System.getenv("MP_BAILIAN_LIVE_GUARD_FILE");
        assertNotNull(guard,"A durable guard file is required before any live call");
        Path marker=Path.of(guard);
        assertTrue(marker.isAbsolute(),"Guard path must be absolute");
        Files.createDirectories(marker.getParent());
        // CREATE_NEW is atomic and is deliberately retained even if the request fails.
        Files.createFile(marker);
        String key=System.getenv("BAILIAN_API_KEY");
        assertNotNull(key,"BAILIAN_API_KEY must be supplied by the backend environment loader");
        var adapter=new BailianAiGateway(key,fallback("BAILIAN_BASE_URL",BailianAiGateway.DEFAULT_BASE_URL),fallback("BAILIAN_MODEL",BailianAiGateway.DEFAULT_MODEL),new BailianAiGateway.HttpTransport(),1,30000,15000,Thread::sleep);
        var response=adapter.generate(new AiGateway.Request(AiGateway.Workload.INITIAL_RECOMMENDATION_EXPLANATION,"p0-synthetic-v1"));
        assertEquals("DATA_SCIENCE",response.payload().major());
        assertEquals(1,response.metadata().attempts());
        // Metadata only; payload, key, authorization headers and supplier body are not logged.
        System.out.printf("P0_BAILIAN_LIVE status=PASS model=%s attempts=%d elapsedMs=%d promptTokens=%d completionTokens=%d%n",response.metadata().model(),response.metadata().attempts(),response.metadata().elapsedMs(),response.metadata().promptTokens(),response.metadata().completionTokens());
    }
    private static String fallback(String key,String value) { String configured=System.getenv(key);return configured==null||configured.isBlank()?value:configured; }
}
