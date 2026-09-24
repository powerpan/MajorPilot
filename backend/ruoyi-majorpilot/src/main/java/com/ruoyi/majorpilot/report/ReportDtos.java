package com.ruoyi.majorpilot.report;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;

/** HTTP control DTOs. Report bodies and claims are owned by the versioned pure report core. */
public final class ReportDtos {
    private ReportDtos() {}
    public record Generation(String status,String phase,boolean retryable,String safeCode) {}
    public record Status(String reportId,String status,String currentVersionId,Generation generation,long revision) {}
    public record Summary(String reportId,String reportType,String majorCode,String status,String currentVersionId,
                          Long versionNo,Generation generation,Instant readyAt,Instant firstReadyAt,long revision,
                          @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) String sourceRunId) {}
    public record Page(List<Summary> items,String nextCursor) {}
    public record MajorState(String majorCode,String status) {}
    public record Waiting(String state,String reason,List<MajorState> majors) {}
    public record ComparisonReady(String state,JsonNode report,Generation generation) {}
    public record Regenerate(Long expectedRevision,String reasonCode,String reason,String evidenceMode,String targetEvidenceRuleVersion) {}
    public record Requested(String reportId,String reportVersionId,String status,long revision) {}
    public record Feedback(String feedbackType,String contextType,String contextPublicId,Integer rating,String comment,
                           String surveyVersion,JsonNode answers,String diagnosticCode) {}
    public record FeedbackAccepted(String feedbackId,String status) {}
}
