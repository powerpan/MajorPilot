import { api } from "./api";
import type { Answers, AnswerValue, Field, Questionnaire, Recommendation } from "../types";

export type AnswerState = "ANSWERED" | "MISSING" | "SKIPPED" | "UNSURE";
export interface ProfileView {
  decisionProfileId: string;
  profileVersion: number;
  questionnaireVersion: string;
  submittedAt: string;
  answers: Answers;
  answerStates: Record<string, AnswerState>;
  complete: boolean;
  recommendationReady: boolean;
}
export interface ProfileDraft {
  revision: number;
  baseProfileVersion: number;
  questionnaireVersion: string;
  answers: Answers;
  lastStepKey: string;
  mode: "EDIT" | "RESTART";
}
export interface ProfileState {
  profile: ProfileView | null;
  draft: ProfileDraft | null;
  draftRevision: number;
}
export interface ProfileInput {
  questionnaireVersion: string;
  expectedRevision: number;
  baseProfileVersion: number;
  answers: Answers;
  lastStepKey: string;
  mode: "EDIT" | "RESTART";
}
export interface ProfileSubmission {
  profile: ProfileView;
  recommendation: Recommendation | null;
  draftRevision?: number;
}
export const fetchProfile = (signal?: AbortSignal) => api<ProfileState>("/api/app/v1/profile", { signal });

export const profileLabels: Record<string, string> = {
  applicationStage: "申请阶段", targetIntakeWindow: "预计入学时间", targetRegions: "考虑地区",
  currentField: "当前学习或工作背景", currentFieldText: "具体专业或方向", consideredMajors: "考虑的专业方向",
  majorFamiliarity: "对专业的了解", foundationSelfView: "基础自评", scenarioPreference: "想先尝试的情境",
  workElements: "感兴趣的工作环节", decisionUncertainties: "希望弄清的问题", mainQuestion: "补充困惑", acquisitionChannel: "了解我们的渠道",
};
export const profileGroups = [
  { title: "申请背景", keys: ["applicationStage", "targetIntakeWindow", "targetRegions", "currentField", "currentFieldText"] },
  { title: "考虑方向", keys: ["consideredMajors", "majorFamiliarity"] },
  { title: "基础自评", keys: ["foundationSelfView"] },
  { title: "工作偏好", keys: ["scenarioPreference", "workElements"] },
  { title: "主要困惑", keys: ["decisionUncertainties", "mainQuestion"] },
  { title: "其他信息", keys: ["acquisitionChannel"] },
];
export function profileField(definition: Questionnaire | null, key: string): Field | undefined {
  return definition?.pages.flatMap(page => page.fields).find(field => field.key === key);
}
export function answerText(field: Field | undefined, value: AnswerValue | undefined): string {
  if (value === null) return "主动跳过";
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "尚未填写";
  const label = (code: string) => field?.options.find(option => option.code === code)?.label || code;
  if (typeof value === "string") return label(value);
  if (Array.isArray(value)) {
    if (field?.type === "RANKING") return value.map(item => typeof item === "object" && item !== null ? `${label(item.majorCode)}：第 ${item.rank} 优先` : "").filter(Boolean).join("；");
    return (value as string[]).map(label).join("、");
  }
  return (field?.rows || Object.keys(value).map(code => ({ code, label: code })))
    .map(row => `${row.label}：${value[row.code] ? label(value[row.code]!) : "尚未填写"}`).join("；");
}
export function partialProblem(field: Field, value: AnswerValue | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  if (field.type === "TEXT" && typeof value === "string" && [...value].length > (field.maxLength || 300))
    return `请控制在 ${field.maxLength || 300} 字以内。`;
  return "";
}
/** Whole-questionnaire skip preserves every answer already supplied. */
export function skipUnanswered(definition: Questionnaire, answers: Answers): Answers {
  const next = { ...answers };
  for (const field of definition.pages.flatMap(page => page.fields)) {
    const value = next[field.key];
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) next[field.key] = null;
  }
  return next;
}
