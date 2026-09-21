package com.ruoyi.majorpilot.operations;

import java.time.Instant;
import java.util.List;
import com.fasterxml.jackson.databind.JsonNode;

/** Product-admin projections never serialize persistence rows. */
public final class OperationsDtos {
    private OperationsDtos() {}
    public record Page<T>(List<T> rows,long total) {}
    public record Filters(Instant from,Instant to,Instant asOf,String majorCode,String taskVersionId,
                          String questionnaireVersion,String recommendationRuleVersion,String reportType) {
        public Filters(Instant from,Instant to,Instant asOf,String majorCode,String taskVersionId,String questionnaireVersion,String recommendationRuleVersion){this(from,to,asOf,majorCode,taskVersionId,questionnaireVersion,recommendationRuleVersion,null);}
    }
    public record StudentRow(String studentId,String alias,String status,String analyticsExclusionCode,long revision,
                             Instant createdAt,Instant emailVerifiedAt,Instant lastLoginAt,long profileCount,
                             long startedMajorCount,long closedMajorCount) {}
    public record RunRow(String experienceRunId,String studentId,String studentAlias,String contentKind,String runMode,
                         String majorCode,String taskVersionId,String taskVersionCode,String status,String currentStepKey,
                         long revision,int attemptNo,String originRunId,Instant startedAt,Instant closedAt,Instant lastActivityAt) {}
    public record ReportRow(String reportId,String studentId,String studentAlias,String reportType,String majorCode,
                            String status,String currentVersionId,Long versionNo,String generationMode,String failureCode,
                            Instant requestedAt,Instant readyAt,Instant firstReadyAt,long revision) {}
    public record ReportPage(List<ReportRow> rows,long total,List<String> scopeNotes) {}
    public record TaskRow(String taskVersionId,String contentKind,String majorCode,String demoKey,String versionCode,
                          String title,String status,String manifestSha256,String dataSha256,Long reviewedByOperatorId,
                          Instant publishedAt,Instant retiredAt,long revision) {}
    public record TaskReviewContext(String taskVersionId,String manifestPath,List<String> requiredReviewChecks,String status,long revision) {}
    public record AuditRow(String auditId,long operatorId,String actionCode,String targetType,String targetPublicId,
                           String studentAlias,String reasonCode,Instant occurredAt) {}
    public record Exclusion(Long expectedRevision,String exclusionCode,String reason) {}
    public record SensitiveView(String purpose,String reason) {}
    public record ExportCreate(String dataset,Filters filters,List<String> fields,String purpose) {}
    public record ExportStatus(String exportId,String dataset,String schemaVersion,Filters filters,List<String> fields,String timeAnchor,String status,Long rowCount,
                               Long fileSizeBytes,Instant requestedAt,Instant completedAt,Instant expiresAt,
                               String failureCode,long revision,List<String> scopeNotes) {}
    public record ConsentSummary(String documentType,String documentVersion,String decision,Instant decidedAt) {}
    public record ProfileSummary(String decisionProfileId,String questionnaireVersion,long versionNo,String status,Instant submittedAt) {}
    public record StudentDetails(List<ConsentSummary> consents,List<ProfileSummary> profiles,int historyLimit) {}
    public record StudentDetail(StudentRow summary,StudentDetails details) {}
    public record StepSummary(String stepKey,String status,long currentRevision,Instant completedAt) {}
    public record ExecutionSummary(String operationKey,String status,String trustLevel,String errorCode,long count) {}
    public record RunDetails(List<StepSummary> steps,List<ExecutionSummary> executions) {}
    public record RunDetail(RunRow summary,RunDetails details) {}
    public record SensitiveStudent(String studentId,String email) {}
    public record ResponseRevision(String stepKey,long revision,JsonNode response,Instant receivedAt) {}
    public record SensitiveRun(String experienceRunId,List<ResponseRevision> responses,JsonNode reflection) {}
    public record JobCount(String jobType,String status,long count) {}
    public record SafeError(String source,String code,long count) {}
    public record Retention(String policyKey,Instant lastStartedAt,Instant lastCompletedAt,String lastErrorCode,long deletedCount,Instant nextDueAt) {}
    public record Health(Instant checkedAt,List<JobCount> jobs,List<SafeError> safeErrors,long overdueDeletionCount,
                         long reportReadyVersionCount,long reportFallbackVersionCount,Long unknownCostCalls,
                         java.math.BigDecimal knownEstimatedCost,List<Retention> retention,List<String> coverageNotes) {}
}
