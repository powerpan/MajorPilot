package com.ruoyi.majorpilot.analytics.metrics;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/** Safe, immutable projections from one database snapshot; no answers, email, or report body. */
public final class MetricsModels {
    private MetricsModels() {}

    public record Filters(String majorCode, String taskVersionId, String questionnaireVersion,
                          String recommendationRuleVersion) {
        public static Filters all() { return new Filters(null, null, null, null); }
    }
    /** Null dates default to [asOf - 90 days, asOf); asOf itself must be supplied. */
    public record Query(Instant asOf, Instant from, Instant to, Filters filters) {}
    public record Student(long id, String status, String analyticsExclusionCode,
                          Instant createdAt, Instant emailVerifiedAt) {}
    /** Version dimensions are pinned to this Run's original profile/recommendation, never current. */
    public record Run(long id, long studentId, Long originRunId, String contentKind, String runMode,
                      String majorCode, String taskVersionId, String questionnaireVersion,
                      String recommendationRuleVersion, Instant createdAt, Instant startedAt,
                      Instant closedAt) {}
    /** EXPERIENCE has exactly one source; COMPARISON has its immutable source Run set. */
    public record Report(long id, long studentId, String reportType, List<Long> sourceRunIds,
                         Instant firstReadyAt) {
        public Report { sourceRunIds = List.copyOf(sourceRunIds); }
    }
    /** A valid survey can omit insightResponse. Never merge its answers with a later survey. */
    public record Survey(long id, long studentId, long reportId, String surveyVersion,
                         boolean firstValidSurvey, Integer insightResponse, Instant createdAt) {}
    public record Intake(long id, Long studentId, String questionnaireVersion, Instant startedAt,
                         Instant submittedAt, Instant claimedAt) {}
    /** receivedAt is the only event observation clock. Resolved foreign keys remain ownership checked. */
    public record Observation(String id, String eventName, Long studentId, Long intakeId,
                              Long runId, Long reportId, String stepKey, Instant receivedAt) {}
    /** Historical completion, not the current mutable step status. */
    public record StepCompletion(long runId, String stepKey, Instant completedAt) {}
    public record TaskDefinition(String taskVersionId, String majorCode, List<String> stepKeys) {
        public TaskDefinition { stepKeys = List.copyOf(stepKeys); }
    }
    public record Snapshot(Instant dataUpdatedAt, List<Student> students, List<Intake> intakes,
                           List<Run> runs, List<Report> reports, List<Survey> surveys,
                           List<Observation> observations, List<StepCompletion> stepCompletions,
                           List<TaskDefinition> taskDefinitions) {
        public Snapshot {
            students = List.copyOf(students); intakes = List.copyOf(intakes); runs = List.copyOf(runs);
            reports = List.copyOf(reports); surveys = List.copyOf(surveys);
            observations = List.copyOf(observations); stepCompletions = List.copyOf(stepCompletions);
            taskDefinitions = List.copyOf(taskDefinitions);
        }
    }

    /** Rates are ratios [0,1], rounded HALF_UP to 6 places; null means no denominator. */
    public record Kpi(long numerator, long denominator, BigDecimal rate, long cohortCount,
                      long immatureCount, String anchor, int windowDays) {}
    public record Coverage(long numerator, long denominator, BigDecimal rate,
                           long answeredWithoutViewed, long unobservedReportCount) {}
    public record SecondTiming(long before, long after) {}
    public record Core(Kpi firstExperienceCompletion, Kpi reportInsight, Kpi secondExperienceStart,
                       Coverage feedbackCoverage, SecondTiming secondStartTiming) {}
    public record MajorBreakdown(String majorCode, Core metrics) {}
    /** Null secondMajorCode is an observed absence of a second formal start, not a guessed choice. */
    public record ComparisonBreakdown(String firstMajorCode, String secondMajorCode, Funnel funnel) {}
    public record Stage(String key, long count, BigDecimal previousConversion,
                        BigDecimal cumulativeConversion) {}
    public record Funnel(String key, String grain, String anchor, List<Stage> stages,
                         List<String> coverageNotes) {
        public Funnel { stages = List.copyOf(stages); coverageNotes = List.copyOf(coverageNotes); }
    }
    public record StepDiagnostic(String stepKey, long viewedStudents, long completedStudents,
                                 long errorStudents, long recoveryStudents,
                                 long hintStudents) {}
    public record TaskFunnel(String taskVersionId, String majorCode, Funnel funnel,
                             List<StepDiagnostic> diagnostics) {
        public TaskFunnel { diagnostics = List.copyOf(diagnostics); }
    }
    public record Exclusions(long testStudents, long botStudents, long deletionStudents,
                             long nonStandardRuns) {}
    public record Diagnostics(long eligibleStudents, long runsWithActivityObservations,
                              long eligibleStartedRuns, long observedActiveSeconds,
                              BigDecimal activityObservationCoverage) {}
    public record Overview(String metricsVersion, Instant asOf, Instant from, Instant to,
                           Filters filters, Instant dataUpdatedAt, Exclusions exclusions, Core metrics,
                           List<MajorBreakdown> byMajor, List<Funnel> funnels,
                           List<ComparisonBreakdown> comparisonByMajorPair,
                           List<TaskFunnel> taskFunnels, Diagnostics diagnostics,
                           List<String> coverageNotes) {
        public Overview {
            byMajor = List.copyOf(byMajor); funnels = List.copyOf(funnels);
            comparisonByMajorPair = List.copyOf(comparisonByMajorPair);
            taskFunnels = List.copyOf(taskFunnels); coverageNotes = List.copyOf(coverageNotes);
        }
    }
}
