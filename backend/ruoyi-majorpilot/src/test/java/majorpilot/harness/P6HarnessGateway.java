package majorpilot.harness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.integration.ai.ReportGateway;
import com.ruoyi.majorpilot.report.core.ReportCore;
import com.ruoyi.majorpilot.report.core.ReportModels.Violation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.LinkOption;
import java.util.List;
import java.util.Set;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Test-only replay/fault gateway. Intentionally no HTTP client or provider credentials. */
@Component @Primary @Profile("p6-harness")
public final class P6HarnessGateway implements ReportGateway {
    private final ObjectMapper mapper;
    private final ReportCore core;
    private final Path directory;
    public P6HarnessGateway(ObjectMapper mapper, ReportCore core, Environment environment) {
        this.mapper=mapper; this.core=core;
        directory=Path.of(environment.getRequiredProperty("MP_P6_HARNESS_DIR")).toAbsolutePath().normalize();
        if (!directory.endsWith("data/p6-harness")) throw new IllegalStateException("Harness control path rejected");
    }
    @Override public boolean available(){ return !mode().equals("AI_OFF"); }
    private String mode() {
        try {
            Path file=directory.resolve("gateway-control.json");
            if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)||Files.size(file)>512)throw new IllegalStateException();
            var control=mapper.readTree(Files.readString(file));
            if(!control.isObject()||control.size()!=1||!control.path("mode").isTextual())throw new IllegalStateException();
            String value=control.path("mode").asText();
            if(!Set.of("PASS","AI_OFF","INVALID_INITIAL","INVALID_ALWAYS","UPSTREAM_429","TIMEOUT","HOLD_INITIAL","HOLD_REPAIR").contains(value))throw new IllegalStateException();
            return value;
        }catch(Exception failure){throw new IllegalStateException("Harness control rejected; payload suppressed");}
    }
    @Override public Outcome attempt(Attempt request) {
        long start=System.nanoTime();
        try {
            String mode=mode();boolean holdTimedOut=false;
            if(mode.equals("AI_OFF"))throw new IllegalStateException("Disabled harness gateway");
            if (mode.equals("HOLD_"+request.stage().name())) {
                Path entered=directory.resolve("gateway-entered.json");
                if(Files.isSymbolicLink(entered))throw new IllegalStateException("Harness control rejected");
                Files.writeString(entered, mapper.writeValueAsString(java.util.Map.of(
                    "stage", request.stage().name(), "invocationId", request.invocationId())));
                long deadline=System.nanoTime()+Math.min(request.remainingBudgetMs(),45000L)*1_000_000L;
                while (!Files.isRegularFile(directory.resolve("gateway-release"),LinkOption.NOFOLLOW_LINKS) && System.nanoTime()<deadline) Thread.sleep(50);
                holdTimedOut=System.nanoTime()>=deadline;
            }
            // One simulated transport attempt; TEST_REPLAY is never real provider traffic.
            var telemetry=new Telemetry("TEST_REPLAY","test-report-proposal-v1",Math.max(0,(System.nanoTime()-start)/1_000_000),1,
                request.input().schemaVersion(),core.hash(request.input().content()),List.of("completeValidProposal"),null,null,null);
            if (mode.equals("INVALID_ALWAYS") || Set.of("INVALID_INITIAL","HOLD_REPAIR").contains(mode)&&request.stage()==Stage.INITIAL)
                return new Outcome(Status.INVALID_OUTPUT,null,List.of(new Violation("TEST_INVALID_PROPOSAL","/sections")),"REPORT_OUTPUT_INVALID",telemetry);
            if (mode.equals("UPSTREAM_429") || mode.equals("TIMEOUT") || holdTimedOut)
                return new Outcome(Status.UPSTREAM_FAILURE,null,List.of(),holdTimedOut||mode.equals("TIMEOUT")?"AI_TIMEOUT":"AI_RATE_LIMITED",telemetry);
            return new Outcome(Status.PROPOSAL_RECEIVED,
                core.parseProposal(mapper.writeValueAsBytes(request.input().content().get("completeValidProposal"))),List.of(),null,telemetry);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Harness gateway interrupted");
        } catch (Exception failure) {
            throw new IllegalStateException("Harness replay failed; payload suppressed");
        }
    }
}
