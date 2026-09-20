package com.ruoyi.majorpilot.integration.ai;

import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;

@Configuration @Profile("p0")
public class P0AiConfiguration {
    /** FAKE by default even when a key exists. Live mode never invokes a model during bean creation. */
    @Bean AiGateway p0AiGateway(Environment environment) {
        String mode=environment.getProperty("MAJORPILOT_AI_MODE","fake");
        return switch(mode) {
            case "fake" -> new FakeAiGateway();
            case "replay" -> new ReplayAiGateway(Map.of(new AiGateway.Request(AiGateway.Workload.INITIAL_RECOMMENDATION_EXPLANATION,"p0-synthetic-v1"),FakeAiGateway.FIXTURE));
            case "bailian" -> new BailianAiGateway(environment.getProperty("BAILIAN_API_KEY"), fallback(environment,"BAILIAN_BASE_URL",BailianAiGateway.DEFAULT_BASE_URL), fallback(environment,"BAILIAN_MODEL",BailianAiGateway.DEFAULT_MODEL));
            default -> throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
        };
    }
    private String fallback(Environment environment,String key,String fallback) { String value=environment.getProperty(key); return value==null || value.isBlank()?fallback:value; }
}
