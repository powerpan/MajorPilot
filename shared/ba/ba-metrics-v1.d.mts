export type Operation = 'ba-metric' | 'ba-funnel' | 'ba-segments';
export type CourseTrack = 'FOUNDATIONS' | 'APPLIED';
export type SignupSource = 'ORGANIC' | 'PARTNER' | 'CAMPAIGN';
export type SegmentBy = 'course_track' | 'signup_source';
export type SegmentKey = CourseTrack | SignupSource;
export type StageKey =
  | 'enrolled_count' | 'first_lesson_count' | 'week_one_active_count'
  | 'assignment_started_count' | 'assignment_submitted_count' | 'completed_count';
export type TransitionKey =
  | 'ENROLLED_TO_FIRST_LESSON'
  | 'FIRST_LESSON_TO_WEEK_ONE_ACTIVE'
  | 'WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED'
  | 'ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED'
  | 'ASSIGNMENT_SUBMITTED_TO_COMPLETED';
export type StageCounts = Record<StageKey, number>;
export interface WeeklyFunnelRow extends StageCounts {
  week: number;
  course_track: CourseTrack;
  signup_source: SignupSource;
  support_contact_count: number;
}
export interface WindowParameters {
  baselineStartWeek: number; baselineEndWeek: number;
  comparisonStartWeek: number; comparisonEndWeek: number;
}
export interface MetricParameters extends WindowParameters {
  numerator: 'completed_count';
  denominator: 'enrolled_count' | 'first_lesson_count';
}
export interface SegmentParameters extends MetricParameters {
  focusTransitionKey: TransitionKey;
  segmentBy: SegmentBy;
}
export interface ParametersByOperation {
  'ba-metric': MetricParameters;
  'ba-funnel': WindowParameters;
  'ba-segments': SegmentParameters;
}
export interface ResultsByOperation {
  'ba-metric': MetricResult;
  'ba-funnel': FunnelResult;
  'ba-segments': SegmentsResult;
}
export function validateRows(rows: unknown): asserts rows is WeeklyFunnelRow[];
export function normalizeParameters<O extends Operation>(
  operation: O, raw: unknown
): ParametersByOperation[O];
export function calculateBa<O extends Operation>(
  operation: O, rows: readonly WeeklyFunnelRow[], raw: unknown,
  metadata: { datasetSha256: string }
): ResultsByOperation[O];

export interface WindowRange { startWeek: number; endWeek: number }
export interface ResultBase {
  schemaVersion: 'ba-result-v1';
  datasetSha256: string;
  windows: { baseline: WindowRange; comparison: WindowRange };
  observation: {
    windowDays: 28;
    cohortBasis: 'ENROLLMENT_WEEK';
    weekOneActiveBasis: 'FIRST_LESSON_7_DAYS_WITHIN_28_DAY_WINDOW';
  };
}
export interface RatioSummary {
  numeratorCount: number;
  denominatorCount: number;
  rate: number | null;
}
export interface MetricResult extends ResultBase {
  operationKey: 'ba-metric';
  numerator: 'completed_count';
  denominator: MetricParameters['denominator'];
  baseline: RatioSummary;
  comparison: RatioSummary;
  deltaPercentagePoints: number | null;
  relativeChange: number | null;
  trend: Array<RatioSummary & { week: number }>;
}
export interface StagePeriod { count: number; cumulativeRate: number | null }
export interface TransitionPeriod {
  numeratorCount: number;
  denominatorCount: number;
  conversionRate: number | null;
  lossCount: number;
}
export interface FunnelResult extends ResultBase {
  operationKey: 'ba-funnel';
  stages: Array<{
    stageKey: StageKey;
    baseline: StagePeriod;
    comparison: StagePeriod;
  }>;
  transitions: Array<{
    transitionKey: TransitionKey;
    fromStageKey: StageKey;
    toStageKey: StageKey;
    baseline: TransitionPeriod;
    comparison: TransitionPeriod;
    deltaPercentagePoints: number | null;
  }>;
}
export interface SegmentPeriod {
  stageCounts: StageCounts;
  enrolledShare: number | null;
  metric: RatioSummary;
  focusTransition: TransitionPeriod;
  supportContactCount: number;
  supportContactsPer100Enrolled: number | null;
}
export interface SegmentsResult extends ResultBase {
  operationKey: 'ba-segments';
  numerator: 'completed_count';
  denominator: MetricParameters['denominator'];
  segmentBy: SegmentBy;
  focusTransitionKey: TransitionKey;
  segments: Array<{
    segmentKey: SegmentKey;
    baseline: SegmentPeriod;
    comparison: SegmentPeriod;
    metricDeltaPercentagePoints: number | null;
    transitionDeltaPercentagePoints: number | null;
  }>;
}

export type SuccessMetric =
  | 'COMPLETION_RATE' | 'FIRST_LESSON_RATE' | 'WEEK_ONE_ACTIVE_RATE'
  | 'ASSIGNMENT_SUBMISSION_RATE' | 'STARTER_COMPLETION_RATE';
export interface ActionValidationInput {
  targetSegmentKey: SegmentKey;
  successMetric: SuccessMetric;
  targetChangePercentagePoints: number;
  guardrailMetric: 'SUPPORT_CONTACTS_PER_100_ENROLLED';
  guardrailMaximum: number;
  reviewAfterDays: 28 | 42;
}
export interface ActionValidationContext {
  parameters: SegmentParameters;
  prioritySegmentKey: SegmentKey;
  result: SegmentsResult;
}
export function validateAction(
  input: ActionValidationInput, context: ActionValidationContext
): void;

export interface BaActionContext {
  parameters: SegmentParameters;
  prioritySegmentKey: SegmentKey;
  comparison: SegmentPeriod;
  sourceRevisions: {
    'b2-metric': number;
    'b3-funnel': number;
    'b4-segment': number;
  };
}
export interface StepCompletion {
  expectedRevision: number;
  expectedSourceRevisions?: Record<string, number>;
}
export const STAGES: readonly StageKey[];
export const TRANSITIONS: readonly TransitionKey[];
export const GROUPS: Readonly<{ course_track: readonly CourseTrack[]; signup_source: readonly SignupSource[] }>;
export const WINDOW_KEYS: readonly (keyof WindowParameters)[];
export const SUCCESS_METRICS: readonly SuccessMetric[];
