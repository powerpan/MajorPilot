package com.ruoyi.majorpilot.report;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.report.core.ReportCore;
import com.ruoyi.majorpilot.report.claims.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.*;
@Configuration @Profile("local")
public class ReportConfiguration {
    @Bean @ConditionalOnMissingBean public EvidenceRuleRegistry evidenceRuleRegistry(){return new EvidenceRuleRegistry();}
    @Bean public EvidenceDeriver evidenceDeriver(ObjectMapper mapper,EvidenceRuleRegistry registry){return new EvidenceDeriver(mapper,registry);}
    @Bean public ReportCore reportCore(ObjectMapper mapper,EvidenceRuleRegistry registry){return new ReportCore(mapper,registry);}
}
