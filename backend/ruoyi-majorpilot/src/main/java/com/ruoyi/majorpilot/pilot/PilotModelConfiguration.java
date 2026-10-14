package com.ruoyi.majorpilot.pilot;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.integration.ai.MethodReportGateway;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;

/** Reuse the exact validated model pipeline, without changing its frozen source signature. */
@Configuration @Profile("pilot")
public class PilotModelConfiguration {
    @Bean MethodReportGateway pilotMethodGateway(ObjectMapper mapper,Environment env){return new MethodReportGateway(mapper,env);}
}
