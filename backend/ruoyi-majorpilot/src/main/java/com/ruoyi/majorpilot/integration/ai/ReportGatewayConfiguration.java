package com.ruoyi.majorpilot.integration.ai;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.report.core.ReportCore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
@Configuration @Profile("local")
public class ReportGatewayConfiguration {
    @Bean @ConditionalOnMissingBean(ReportGateway.class)
    public ReportGateway reportGateway(ObjectMapper mapper,ReportCore core,Environment environment){return new ReportConfiguredGateway(mapper,core,environment);}
}
