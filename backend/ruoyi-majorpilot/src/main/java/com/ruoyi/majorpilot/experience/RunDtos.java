package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

/** Public DTOs; internal ids never cross the student API. */
public final class RunDtos {
    private RunDtos() {}
    public record Create(String decisionId,String demoKey,Long expectedRevision) {}
    public record Transition(Long expectedRevision,String pauseActiveRunId,Long expectedActiveRunRevision) {}
    public record Revision(Long expectedRevision) {}
    public record Save(Long expectedRevision,String responseSchemaVersion,JsonNode response) {}
    public record Execute(String operationKey,Long inputRevision,JsonNode parameters,String inputSha256,JsonNode observedResult) {}
    public record Hint(String stepKey,Integer hintLevel) {}
    public record ReflectionSave(Long expectedRevision,String questionSetVersion,JsonNode answers) {}
    public record Recovery(Long expectedRevision,String reasonCode,String reasonText) {}
    public record StepSummary(String stepKey,String status,long revision) {}
    public record Run(String runId,String contentKind,String majorCode,String demoKey,String status,long revision,
                      String taskVersionId,String currentStepKey,String pausedFromStatus,String activeRunId,String replacementRunId,
                      boolean readOnly,List<StepSummary> steps,Instant startedAt,Instant closedAt,String reportStatus) {}
    public record Step(String stepKey,String status,long revision,String responseSchemaVersion,JsonNode response,JsonNode definition,
                       boolean readOnly,Instant savedAt,List<Execution> executions) {}
    public record Saved(String stepKey,long revision,long runRevision,Instant savedAt,String validationStatus,List<String> invalidatedStepKeys) {}
    public record Execution(String executionId,String operationKey,String stepKey,long inputRevision,Long appliedToRevision,String status,String trustLevel,
                            JsonNode result,String errorCode,long durationMs,boolean reused,int remainingEvaluations) {}
    public record HintResult(String hintId,String stepKey,int hintLevel,String status,JsonNode response,String promptVersion) {}
    public record Reflection(String reflectionId,String questionSetVersion,String status,long revision,JsonNode answers,JsonNode definition,JsonNode followUp,boolean readOnly) {}
    public record FollowUp(String status,JsonNode response,boolean canSkip) {}
}
