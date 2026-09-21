export type MajorCode = "AI" | "DATA_SCIENCE" | "BUSINESS_ANALYTICS";
export type Rank = { majorCode: MajorCode; rank: number };
export type AnswerValue =
  | string
  | string[]
  | Record<string, string>
  | Rank[]
  | null;
export type Answers = Record<string, AnswerValue>;
export interface Option {
  code: string;
  label: string;
}
export interface Field {
  key: string;
  type: "SINGLE" | "MULTIPLE" | "MATRIX" | "RANKING" | "TEXT";
  required: boolean;
  minItems: number | null;
  maxItems: number | null;
  maxLength: number | null;
  options: Option[];
  rows: Option[];
}
export interface QuestionPage {
  stepKey: string;
  number: number;
  title: string;
  why: string;
  required: boolean;
  fields: Field[];
}
export interface Questionnaire {
  questionnaireVersion: string;
  pageCount: number;
  requiredPageCount: number;
  pages: QuestionPage[];
}
export interface Intake {
  intakeSessionId: string;
  questionnaireVersion: string;
  status: string;
  revision: number;
  expiresAt: string;
  lastStepKey: string | null;
  answers: Answers;
  recommendationId: string | null;
}
export interface Reason {
  code: string;
  reasonType: "RANKING" | "CONTEXT" | "BOUNDARY";
  majorCode: MajorCode;
  sourceQuestionKeys: string[];
  text: string;
}
export interface MajorDifference {
  majorCode: MajorCode;
  name: string;
  description: string;
  availability: string;
}
export interface Recommendation {
  decisionProfileId: string;
  recommendationId: string;
  profileVersion: number;
  questionnaireVersion: string;
  ruleVersion: string;
  explanationVersion: string;
  primaryMajor: MajorCode;
  alternativeMajors: MajorCode[];
  reasons: Reason[];
  majorDifferences: MajorDifference[];
  supportNotes: string[];
  explanationStatus: string;
  canRegister: boolean;
  availability: string;
  generatedAt: string;
}
export interface Me {
  studentId: string;
  email: string;
  status: string;
  emailVerified: boolean;
  canStartExperience: boolean;
}
export interface Decision {
  decisionId: string;
  recommendationId: string;
  selectedMajorCode: MajorCode;
  decisionType: string;
}
export interface Dashboard {
  recommendation: Recommendation | null;
  nextRecommendation?: import("./types/reports").NextRecommendation | null;
  majors: (MajorDifference & { status: string })[];
  currentDecision: Decision | null;
  nextStep: string;
}
export interface Consent {
  documentType: "TERMS" | "PRIVACY" | "RESEARCH";
  documentVersion: string;
  decision: "ACCEPTED" | "DECLINED";
  decidedAt?: string;
}
