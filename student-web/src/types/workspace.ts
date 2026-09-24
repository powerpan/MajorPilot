import type { BaActionContext } from "../../../shared/ba/ba-metrics-v1.mjs";
export type Answer = Record<string, unknown>;
export interface InputProperty {
  type: string | string[];
  enum?: (string | number)[];
  const?: unknown;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  minItems?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  properties?: Record<string, InputProperty>;
  required?: string[];
  items?: InputProperty;
}
export interface InputSchema {
  properties: Record<string, InputProperty>;
  required?: string[];
}
export interface StepDefinition {
  stepKey: string;
  title: string;
  instructions: string;
  dependencies: string[];
  required: boolean;
  responseSchemaVersion: string;
  inputSchema: InputSchema;
  assetKeys: string[];
  operationKey: string | null;
}
export interface TaskManifest {
  schemaVersion: string;
  taskVersionId: string;
  contentKind: string;
  majorCode: string | null;
  demoKey: string | null;
  versionCode: string;
  title: string;
  scenario: string;
  goals: string[];
  estimatedMinutes: { minimum: number; maximum: number };
  assets: {
    assetKey: string;
    mediaType: string;
    sha256: string;
    byteLength: number;
  }[];
  steps: StepDefinition[];
  operations: {
    operationKey: string;
    stepKey: string;
    parametersSchema: InputSchema;
    maxEvaluations: number;
    ownResponseBindings?: { parameterKey: string; sourceField: string }[];
    inputBindings?: {
      parameterKey: string;
      sourceStepKey: string;
      sourceField: string;
    }[];
  }[];
  reflection: {
    questionSetVersion: string;
    instructions: string;
    inputSchema: InputSchema;
  };
}
export interface DemoTask {
  demoKey: string;
  title: string;
  contentKind: string;
  versionCode: string;
  availability: string;
}
export interface PreviewTask {
  taskVersionId: string;
  majorCode: string;
  title: string;
  versionCode: string;
  runMode: "REVIEW_PREVIEW";
  reviewStatus: "REVIEW";
  warning: string;
}
export interface Run {
  experienceEdition?: number;
  runMode: "STANDARD" | "REVIEW_PREVIEW";
  productEligible?: boolean;
  runId: string;
  contentKind: string;
  majorCode: string | null;
  demoKey: string | null;
  status:
    | "READY"
    | "IN_PROGRESS"
    | "TASK_COMPLETED"
    | "PAUSED"
    | "CLOSED"
    | "REPLACED";
  revision: number;
  taskVersionId: string | null;
  currentStepKey: string | null;
  pausedFromStatus: string | null;
  activeRunId: string | null;
  replacementRunId: string | null;
  readOnly: boolean;
  steps: { stepKey: string; status: string; revision: number }[];
  startedAt: string | null;
  closedAt: string | null;
  reportStatus: string;
}
export interface Execution {
  executionId: string;
  operationKey: string;
  stepKey: string;
  inputRevision: number;
  appliedToRevision: number | null;
  status: string;
  trustLevel: string;
  result: Answer | null;
  errorCode: string | null;
  durationMs: number;
  reused: boolean;
  remainingEvaluations: number;
  sourceRevisions: Record<string, number>;
  appliedSourceRevisions: Record<string, number> | null;
}
export interface InputBinding {
  parameterKey: string;
  sourceStepKey: string;
  sourceField: string;
  sourceRevision: number;
  value: unknown;
}
export interface Step {
  baActionContext?: BaActionContext;
  stepKey: string;
  status: string;
  revision: number;
  responseSchemaVersion: string;
  response: Answer;
  definition: StepDefinition;
  readOnly: boolean;
  savedAt: string | null;
  executions: Execution[];
  inputBindings: InputBinding[];
}
export interface Saved {
  stepKey: string;
  revision: number;
  runRevision: number;
  savedAt: string;
  validationStatus: string;
  invalidatedStepKeys: string[];
}
export interface Reflection {
  reflectionId: string;
  questionSetVersion: string;
  status: string;
  revision: number;
  answers: Answer;
  definition: TaskManifest["reflection"];
  followUp: Answer | null;
  readOnly: boolean;
}
export interface Hint {
  hintId: string;
  stepKey: string;
  hintLevel: number;
  status: string;
  response: Answer;
  promptVersion: string;
}
export interface Sample {
  rows: { rowId: string; value: number }[];
}
