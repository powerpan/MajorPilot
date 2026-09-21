package com.ruoyi.majorpilot.integration.ai;

import com.ruoyi.majorpilot.report.core.*;
import static com.ruoyi.majorpilot.report.core.ReportModels.*;
import static com.ruoyi.majorpilot.report.core.ReportTestFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Explicit synthetic capability probe. Never selected by normal tests, never a load test. */
@EnabledIfEnvironmentVariable(named="MP_RUN_LIVE_REPORT_TESTS",matches="true")
class ReportLiveTest {
    @Test void oneExplicitProviderAtMostInitialPlusOneRepairWithinFortyFiveSeconds()throws Exception{
        String provider=System.getenv("MP_LIVE_REPORT_PROVIDER");assertTrue(Set.of("BAILIAN","DEEPSEEK").contains(provider==null?"":provider),"Explicit MP_LIVE_REPORT_PROVIDER is required");
        String guard=System.getenv("MP_REPORT_LIVE_GUARD_FILE");assertNotNull(guard,"A durable attempt guard is required before any live report call");
        Path marker=Path.of(guard);assertTrue(marker.isAbsolute()&&Files.isDirectory(marker.getParent(),LinkOption.NOFOLLOW_LINKS)&&!Files.isSymbolicLink(marker.getParent()),"Guard directory must be a real absolute directory");
        // Retain even after a timeout. Re-running the same probe may not resend.
        Files.createFile(marker);
        var core=new ReportCore(JSON);var input=experience("AI",true);var catalog=core.compile(input);var safe=core.modelInput(catalog);String prefix=provider.equals("BAILIAN")?"BAILIAN":"DEEPSEEK";
        String endpoint=value(prefix+"_BASE_URL",provider.equals("BAILIAN")?BailianAiGateway.DEFAULT_BASE_URL:ReportHttpGateway.DEEPSEEK_BASE_URL),model=value(prefix+"_MODEL",provider.equals("BAILIAN")?BailianAiGateway.DEFAULT_MODEL:ReportHttpGateway.DEEPSEEK_MODEL);
        var gateway=new ReportHttpGateway(JSON,core,provider,System.getenv(prefix+"_API_KEY"),endpoint,model);long started=System.nanoTime();var telemetry=new ArrayList<ReportGateway.Telemetry>();List<Violation> issues=List.of();Proposal accepted=null;String code=null;
        for(int attempt=0;attempt<2;attempt++){
            long remaining=45000-TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started);if(remaining<=0){code="TIMEOUT";break;}
            var response=gateway.attempt(new ReportGateway.Attempt("synthetic-report-"+UUID.randomUUID(),attempt==0?ReportGateway.Stage.INITIAL:ReportGateway.Stage.REPAIR,safe,issues,remaining));telemetry.add(response.telemetry());code=response.safeErrorCode();
            if(response.status()==ReportGateway.Status.PROPOSAL_RECEIVED){var validation=core.validate(catalog,response.proposal(),GenerationMode.AI);if(validation.valid()){accepted=response.proposal();break;}issues=validation.issues();code="REPORT_PROPOSAL_INVALID";}
            else if(response.status()==ReportGateway.Status.INVALID_OUTPUT)issues=response.violations();else break;
        }
        var report=accepted==null?core.fallback(input,catalog):core.render(input,catalog,accepted,GenerationMode.AI);assertTrue(report.validation().valid());int attempts=telemetry.stream().mapToInt(ReportGateway.Telemetry::httpAttempts).sum();assertTrue(attempts<=2);
        var summary=JSON.createObjectNode();summary.put("provider",provider).put("status",accepted==null?"FALLBACK_VALIDATED":"AI_VALIDATED").put("catalogSha256",catalog.catalogSha256()).put("claimCount",report.claims().size()).put("boundedClaimCount",report.claims().stream().filter(c->c.claimType()==ClaimType.BOUNDED_INTERPRETATION).count()).put("httpAttempts",attempts).put("durationMs",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started));if(code==null)summary.putNull("safeErrorCode");else summary.put("safeErrorCode",code);summary.set("telemetry",JSON.valueToTree(telemetry));System.out.println("LIVE_REPORT_RESULT="+summary);
        // A fallback proves availability only, never falsely claims live provider capability.
        assertNotNull(report.publicReportJson());
    }
    private static String value(String key,String fallback){String value=System.getenv(key);return value==null||value.isBlank()?fallback:value;}
}
