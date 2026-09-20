import type { Answer } from "../types/workspace";
import type { NumericField } from "../../../shared/ds/ds-stats-v1.mjs";

export interface DsDictionary {
  schemaVersion: string;
  introduction: string;
  targetDefinition: string;
  fields: {
    fieldKey: string;
    label: string;
    description: string;
    unit: string;
  }[];
  notes: string[];
}
export interface DsPythonExamples {
  executionNotice: string;
  snippets: {
    operationKey: string;
    relationshipMode?: string;
    title: string;
    code: string;
  }[];
}
export const numericLabels: Record<NumericField, string> = {
  avg_session_minutes: "平均会话时长（分钟）",
  days_to_first_lesson: "首次学习等待时间（天）",
  assignment_submit_rate: "作业提交率（0–1）",
};
export const fieldLabels: Record<string, string> = {
  ...numericLabels,
  course_track: "课程方向",
  signup_source: "报名来源",
  device_group: "常用设备",
  cohort_period: "早晚批次",
  days_to_first_lesson_band: "首次学习等待区间",
  completed: "是否按期完成",
  support_contacts: "联系支持次数",
  learner_id: "合成学员标识",
  cohort_week: "加入批次",
  lessons_started: "开始单元数",
  lessons_completed: "完成单元数",
  forum_visits: "论坛访问次数",
};
export const optionLabels: Record<string, string> = {
  EXACT_DUPLICATE: "明确重复",
  MISSING_RECORD: "记录缺失",
  REASONABLE_EXTREME: "合理极端值",
  NOT_APPLICABLE: "不适用",
  DROP_EXACT: "删除完全重复",
  KEEP_NULL: "保留缺失",
  DROP_MISSING: "删除记录缺失行",
  MEDIAN_NUMERIC: "中位数填补记录缺失",
  CAP_P95: "将会话时长缩尾至95分位",
  LEARNER: "一名学员的一条记录",
  COURSE: "一门课程",
  DAY: "一天",
  GROUP_COMPLETION: "分组完成率",
  SCATTER: "散点关系",
  FOUNDATIONS: "基础课程",
  APPLIED: "应用课程",
  ORGANIC: "自然来源",
  PARTNER: "合作渠道",
  CAMPAIGN: "活动来源",
  desktop: "桌面设备",
  mobile: "移动设备",
  mixed: "混用设备",
  EARLY: "早期（1–6周）",
  LATE: "晚期（7–12周）",
  SAME_DAY: "同日 [0,1)",
  DAYS_1_2: "[1,3) 天",
  DAYS_3_6: "[3,7) 天",
  DAYS_7_PLUS: "[7,28] 天",
  INSUFFICIENT_FOR_CAUSAL_CLAIM: "证据不足以支持因果结论",
  OBSERVATIONAL_ASSOCIATION_ONLY: "只能说明观察关联",
  CLAIMS_CAUSAL_SUPPORT: "认为支持因果结论",
  SUPPORTED: "支持",
  NOT_SUPPORTED: "不支持",
  INSUFFICIENT_EVIDENCE: "证据不足",
  "d3-profile": "D3 · 分布与分母",
  "d4-relationship": "D4 · 变量关系",
  "d5-stratify": "D5 · 分层解释",
};
export function label(value: unknown): string {
  const key = String(value);
  return fieldLabels[key] || optionLabels[key] || key;
}
export function numberText(
  value: number | null | undefined,
  digits = 3,
): string {
  return value == null || !Number.isFinite(value)
    ? "无可计算值"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(
        value,
      );
}
export function percentText(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value)
    ? "无可计算值"
    : numberText(value * 100, 2) + "%";
}
// No invalid branch fields can survive a mode switch into a saved response.
export function changeRelationshipMode(answer: Answer, mode: string): Answer {
  const next: Answer = { ...answer, relationshipMode: mode };
  delete next.groupBy;
  delete next.xField;
  delete next.yField;
  return next;
}
export function numericDomain(field: NumericField): [number, number] {
  return [
    0,
    field === "avg_session_minutes"
      ? 240
      : field === "days_to_first_lesson"
        ? 28
        : 1,
  ];
}
export function linearPosition(
  value: number,
  domain: [number, number],
  range: [number, number],
): number {
  if (!Number.isFinite(value) || domain[1] <= domain[0])
    throw new Error("INVALID_CHART_COORDINATE");
  return (
    range[0] +
    ((value - domain[0]) / (domain[1] - domain[0])) * (range[1] - range[0])
  );
}
