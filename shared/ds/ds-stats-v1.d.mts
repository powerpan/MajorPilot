export type NumericField = 'avg_session_minutes' | 'days_to_first_lesson' | 'assignment_submit_rate';
export type GroupField = 'course_track' | 'signup_source' | 'device_group' | 'cohort_period' | 'days_to_first_lesson_band';
export type Operation = 'ds-quality-clean' | 'ds-profile' | 'ds-relationship' | 'ds-stratify';
export interface LearnerRow {
  learner_id: string; cohort_week: number; course_track: 'FOUNDATIONS' | 'APPLIED';
  signup_source: 'ORGANIC' | 'PARTNER' | 'CAMPAIGN'; device_group: 'desktop' | 'mobile' | 'mixed';
  lessons_started: number; lessons_completed: number; assignment_submit_rate: number | null;
  avg_session_minutes: number | null; days_to_first_lesson: number | null;
  forum_visits: number; support_contacts: number; completed: boolean;
}
export interface Parameters {
  duplicatePolicy: 'KEEP' | 'DROP_EXACT'; missingPolicy: 'KEEP_NULL' | 'DROP_MISSING' | 'MEDIAN_NUMERIC'; extremePolicy: 'KEEP' | 'CAP_P95';
  distributionField?: NumericField; relationshipMode?: 'GROUP_COMPLETION' | 'SCATTER';
  groupBy?: GroupField; xField?: NumericField; yField?: NumericField; stratifyBy?: 'course_track' | 'cohort_period';
}
export interface Exclusions { missingOnly: number; notApplicableOnly: number; both: number; total: number }
export interface FieldQuality { fieldKey: NumericField; validCount: number; missingCount: number; notApplicableCount: number }
export interface Quality {
  duplicateRows: number; duplicateGroups: { learnerId: string; rowNumbers: number[] }[];
  removedDuplicateRows: number; removedMissingRows: number;
  before: FieldQuality[]; after: FieldQuality[]; imputations: { fieldKey: NumericField; count: number; median: number | null }[];
  cappedRows: number; capValue: number | null;
}
export interface Completion { n: number; completedCount: number; completionRate: number | null; ciLower: number | null; ciUpper: number | null }
export interface Group extends Completion { key: string }
export interface Scatter { n: number; meanX: number | null; meanY: number | null; r: number | null }
export interface Relationship {
  relationshipMode: 'GROUP_COMPLETION' | 'SCATTER'; analysisRows: number; exclusions: Exclusions;
  groupBy?: GroupField; groups?: Group[]; xField?: NumericField; yField?: NumericField;
  scatter?: Scatter; points?: { rowNumber: number; x: number; y: number }[];
}
export interface Profile {
  distributionField: NumericField; completion: Completion; validCount: number; missingCount: number; notApplicableCount: number;
  mean: number | null; minimum: number | null; q25: number | null; median: number | null; q75: number | null; maximum: number | null;
  histogram: { lower: number; upper: number; upperInclusive: boolean; count: number }[];
}
export interface DsResult {
  schemaVersion: 'ds-result-v1'; operationKey: Operation; datasetSha256: string; cleaningConfigSha256: string;
  inputRows: number; retainedRows: number; uniqueLearners: number; analysisRows: number; exclusions: Exclusions; quality: Quality;
  profile?: Profile; relationship?: Relationship;
  stratified?: { stratifyBy: 'course_track' | 'cohort_period'; overall: Relationship; strata: { key: string; retainedRows: number; summary: Relationship }[] };
}
export const NUMERIC_FIELDS: readonly NumericField[];
export const GROUPS: Readonly<Record<GroupField, readonly string[]>>;
export const BINS: Readonly<Record<NumericField, readonly number[]>>;
export function normalizeParameters(operation: Operation, raw: Parameters | Record<string, unknown>): Parameters;
export function calculateDs(operation: Operation, rows: LearnerRow[], raw: Parameters, metadata: { datasetSha256: string }): Promise<DsResult>;
export function calculateDsPrepared(operation: Operation, rows: LearnerRow[], raw: Parameters, metadata: { datasetSha256: string; cleaningConfigSha256: string }): DsResult;
export function validateRows(rows: unknown): asserts rows is LearnerRow[];
export function quantile(values: number[], p: number): number | null;
export function wilson(successes: number, n: number): { lower: number | null; upper: number | null };
export function pearson(points: { x: number; y: number }[]): Scatter;
export function halfUp6(value: number | null): number | null;
