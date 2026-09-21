package com.ruoyi.majorpilot.integration.ai;
import com.ruoyi.majorpilot.report.core.ReportModels.*;
import java.math.BigDecimal;
import java.util.List;

/** One attempt = at most one HTTP request. Durable orchestration owns all retry/repair budgets. */
public interface ReportGateway {
    enum Stage { INITIAL, REPAIR }
    enum Status { PROPOSAL_RECEIVED, INVALID_OUTPUT, UPSTREAM_FAILURE }
    record Attempt(String invocationId,Stage stage,SafeModelInput input,List<Violation> repairIssues,long remainingBudgetMs){public Attempt{repairIssues=List.copyOf(repairIssues);}}
    record Telemetry(String provider,String model,long durationMs,int httpAttempts,String inputSchemaVersion,String inputSha256,List<String> inputFieldKeys,Long inputTokens,Long outputTokens,BigDecimal estimatedCost){public Telemetry{inputFieldKeys=List.copyOf(inputFieldKeys);}}
    record Outcome(Status status,Proposal proposal,List<Violation> violations,String safeErrorCode,Telemetry telemetry){public Outcome{violations=List.copyOf(violations);}}
    boolean available();
    Outcome attempt(Attempt request);
}
