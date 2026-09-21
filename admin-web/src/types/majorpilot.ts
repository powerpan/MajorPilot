// Safe projections of OperationsDtos / MetricsModels. Never persistence rows.
export type MajorCode = 'AI' | 'DATA_SCIENCE' | 'BUSINESS_ANALYTICS'
export interface Filters {
  from?: string; to?: string; asOf?: string; majorCode?: MajorCode;
  taskVersionId?: string; questionnaireVersion?: string; recommendationRuleVersion?: string;
  reportType?: 'EXPERIENCE' | 'COMPARISON'
}
export interface Query extends Filters {
  pageNum?: number; pageSize?: number; sortBy?: string; sortOrder?: 'asc' | 'desc';
  status?: string; studentId?: string; runMode?: 'STANDARD' | 'REVIEW_PREVIEW'; exclusionCode?: 'NONE' | 'TEST' | 'BOT'
}
export interface Page<T> { rows: T[]; total: number; scopeNotes?: string[] }
export interface StudentRow {
  studentId: string; alias: string; status: string; analyticsExclusionCode: 'TEST' | 'BOT' | null;
  revision: number; createdAt: string; emailVerifiedAt: string | null; lastLoginAt: string | null;
  profileCount: number; startedMajorCount: number; closedMajorCount: number
}
export interface RunRow {
  experienceRunId: string; studentId: string; studentAlias: string; contentKind: string; runMode: string;
  majorCode: MajorCode | null; taskVersionId: string | null; taskVersionCode: string | null; status: string;
  currentStepKey: string | null; revision: number; attemptNo: number; originRunId: string | null;
  startedAt: string | null; closedAt: string | null; lastActivityAt: string | null
}
export interface ReportRow {
  reportId: string; studentId: string; studentAlias: string; reportType: string; majorCode: MajorCode | null;
  status: string; currentVersionId: string | null; versionNo: number | null; generationMode: string | null;
  failureCode: string | null; requestedAt: string; readyAt: string | null; firstReadyAt: string | null; revision: number
}
export interface TaskRow {
  taskVersionId: string; contentKind: string; majorCode: MajorCode | null; demoKey: string | null;
  versionCode: string; title: string; status: string; manifestSha256: string; dataSha256: string;
  reviewedByOperatorId: number | null; publishedAt: string | null; retiredAt: string | null; revision: number
}
export interface AuditRow {
  auditId: string; operatorId: number; actionCode: string; targetType: string; targetPublicId: string;
  studentAlias: string | null; reasonCode: string | null; occurredAt: string
}
export interface StudentDetail {
  summary: StudentRow;
  details: {
    consents: { documentType: string; documentVersion: string; decision: string; decidedAt: string }[];
    profiles: { decisionProfileId: string; questionnaireVersion: string; versionNo: number; status: string; submittedAt: string }[];
    historyLimit: number
  }
}
export interface RunDetail {
  summary: RunRow;
  details: {
    steps: { stepKey: string; status: string; currentRevision: number; completedAt: string | null }[];
    executions: { operationKey: string; status: string; trustLevel: string; errorCode: string | null; count: number }[]
  }
}
export interface SensitiveStudent { studentId: string; email: string }
export interface SensitiveRun {
  experienceRunId: string;
  responses: { stepKey: string; revision: number; response: unknown; receivedAt: string }[];
  reflection: unknown
}
export type ExportDataset = 'STUDENTS' | 'EXPERIENCE_RUNS' | 'REPORTS' | 'METRICS'
export interface ExportStatus {
  exportId: string; dataset: ExportDataset; schemaVersion: string; filters: Filters; fields: string[]; timeAnchor: string;
  status: string; rowCount: number | null; fileSizeBytes: number | null; requestedAt: string;
  completedAt: string | null; expiresAt: string | null; failureCode: string | null; revision: number; scopeNotes: string[]
}
export interface Kpi {
  numerator: number; denominator: number; rate: number | null; cohortCount: number; immatureCount: number;
  anchor: string; windowDays: number
}
export interface CoreMetrics {
  firstExperienceCompletion: Kpi; reportInsight: Kpi; secondExperienceStart: Kpi;
  feedbackCoverage: { numerator: number; denominator: number; rate: number | null; answeredWithoutViewed: number; unobservedReportCount: number };
  secondStartTiming: { before: number; after: number }
}
export interface Funnel {
  key: string; grain: string; anchor: string;
  stages: { key: string; count: number; previousConversion: number | null; cumulativeConversion: number | null }[];
  coverageNotes: string[]
}
export interface Overview {
  metricsVersion: string; asOf: string; from: string; to: string; filters: Filters; dataUpdatedAt: string;
  exclusions: { testStudents: number; botStudents: number; deletionStudents: number; nonStandardRuns: number };
  metrics: CoreMetrics; byMajor: { majorCode: MajorCode; metrics: CoreMetrics }[]; funnels: Funnel[];
  comparisonByMajorPair: { firstMajorCode: MajorCode; secondMajorCode: MajorCode | null; funnel: Funnel }[];
  taskFunnels: { taskVersionId: string; majorCode: MajorCode; funnel: Funnel; diagnostics: {
    stepKey: string; viewedStudents: number; completedStudents: number; errorStudents: number; recoveryStudents: number; hintStudents: number
  }[] }[];
  diagnostics: { eligibleStudents: number; runsWithActivityObservations: number; eligibleStartedRuns: number; observedActiveSeconds: number; activityObservationCoverage: number | null };
  coverageNotes: string[];
  health: {
    checkedAt: string; jobs: { jobType: string; status: string; count: number }[];
    safeErrors: { source: string; code: string; count: number }[]; overdueDeletionCount: number;
    reportReadyVersionCount: number; reportFallbackVersionCount: number;
    unknownCostCalls: number | null; knownEstimatedCost: number | null;
    retention: { policyKey: string; lastStartedAt: string | null; lastCompletedAt: string | null; lastErrorCode: string | null; deletedCount: number; nextDueAt: string | null }[];
    coverageNotes: string[]
  }
}
