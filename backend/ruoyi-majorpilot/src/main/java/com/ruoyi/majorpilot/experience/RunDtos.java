package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Public DTOs; internal ids never cross the student API. */
public final class RunDtos {
    private RunDtos() {}
    public record Create(String decisionId,String demoKey,Long expectedRevision) {}
    public record CreatePreview(String taskVersionId) {}
    public record InputBinding(String parameterKey,String sourceStepKey,String sourceField,long sourceRevision,JsonNode value) {}
    public record Transition(Long expectedRevision,String pauseActiveRunId,Long expectedActiveRunRevision) {}
    public record Revision(Long expectedRevision) {}
    public record StepCompletion(Long expectedRevision,
                                 @JsonInclude(JsonInclude.Include.NON_NULL) Map<String,Long> expectedSourceRevisions) {
        public StepCompletion(Long expectedRevision){this(expectedRevision,null);}
    }
    public record Save(Long expectedRevision,String responseSchemaVersion,JsonNode response) {}
    public record Execute(String operationKey,Long inputRevision,JsonNode parameters,String inputSha256,JsonNode observedResult,
                          @JsonInclude(JsonInclude.Include.NON_NULL) Map<String,Long> expectedSourceRevisions) {
        /** Keep old request fingerprints byte-compatible when the optional v3 field is absent. */
        public Execute(String operationKey,Long inputRevision,JsonNode parameters,String inputSha256,JsonNode observedResult){this(operationKey,inputRevision,parameters,inputSha256,observedResult,null);}
    }
    public record Hint(String stepKey,Integer hintLevel) {}
    public record ReflectionSave(Long expectedRevision,String questionSetVersion,JsonNode answers) {}
    public record Recovery(Long expectedRevision,String reasonCode,String reasonText) {}
    public record StepSummary(String stepKey,String status,long revision) {}
    public record Run(String runId,String contentKind,String majorCode,String demoKey,String status,long revision,
                      String taskVersionId,String currentStepKey,String pausedFromStatus,String activeRunId,String replacementRunId,
                      boolean readOnly,List<StepSummary> steps,Instant startedAt,Instant closedAt,String reportStatus,String runMode) {
        /** Pre-V6 idempotency receipts are exclusively STANDARD; migration does not rewrite safe receipts. */
        public Run {if(runMode==null)runMode="STANDARD";}
    }
    public record BaActionContext(JsonNode parameters,String prioritySegmentKey,JsonNode comparison,Map<String,Long> sourceRevisions) {}
    public record Step(String stepKey,String status,long revision,String responseSchemaVersion,JsonNode response,JsonNode definition,
                       boolean readOnly,Instant savedAt,List<Execution> executions,List<InputBinding> inputBindings,
                       @JsonInclude(JsonInclude.Include.NON_NULL) BaActionContext baActionContext) {
        public Step(String stepKey,String status,long revision,String responseSchemaVersion,JsonNode response,JsonNode definition,
                    boolean readOnly,Instant savedAt,List<Execution> executions,List<InputBinding> inputBindings){this(stepKey,status,revision,responseSchemaVersion,response,definition,readOnly,savedAt,executions,inputBindings,null);}
    }
    public record Saved(String stepKey,long revision,long runRevision,Instant savedAt,String validationStatus,List<String> invalidatedStepKeys) {}
    public record Execution(String executionId,String operationKey,String stepKey,long inputRevision,Long appliedToRevision,String status,String trustLevel,
                            JsonNode result,String errorCode,long durationMs,boolean reused,int remainingEvaluations,
                            Map<String,Long> sourceRevisions,Map<String,Long> appliedSourceRevisions) {
        public Execution {if(sourceRevisions==null){sourceRevisions=Map.of();if(appliedToRevision!=null&&appliedSourceRevisions==null)appliedSourceRevisions=Map.of();}}
    }
    public record HintResult(String hintId,String stepKey,int hintLevel,String status,JsonNode response,String promptVersion) {}
    public record Reflection(String reflectionId,String questionSetVersion,String status,long revision,JsonNode answers,JsonNode definition,JsonNode followUp,boolean readOnly) {}
    public record FollowUp(String status,JsonNode response,boolean canSkip) {}
}
