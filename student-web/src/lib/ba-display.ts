import type {
  BaActionContext,
  FunnelResult,
  SegmentBy,
  SuccessMetric,
  StageKey,
} from "../../../shared/ba/ba-metrics-v1.mjs";
import type { Answer } from "../types/workspace";
export type BaResult =
  import("../../../shared/ba/ba-metrics-v1.mjs").ResultsByOperation[import("../../../shared/ba/ba-metrics-v1.mjs").Operation];
export interface BaDictionary {
  introduction?: string;
  observationUnit?: string;
  fields: {
    fieldKey: string;
    label: string;
    description: string;
    unit: string;
  }[];
}
export interface BaBrief {
  title: string;
  role: string;
  problem: string;
  observationWindow: string;
  scope: string[];
  unavailable: string[];
  reviewNotice: string;
  actionBoundary: string;
}
export interface BaSql {
  executionNotice: string;
  snippets: { operationKey: string; title: string; code: string }[];
}
const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const baNumber = (value: number | null | undefined, digits = 2) =>
  finite(value)
    ? new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(
        Object.is(value, -0) ? 0 : value,
      )
    : "不可计算";
// Three unit contracts. Only fractional ratios are multiplied by 100.
export const rateText = (value: number | null | undefined) =>
  finite(value) ? `${baNumber(value * 100)}%` : "不可计算";
export const ppText = (value: number | null | undefined) =>
  finite(value)
    ? `${value > 0 ? "+" : ""}${baNumber(value)} 个百分点`
    : "不可计算";
export const supportText = (value: number | null | undefined) =>
  finite(value) ? `${baNumber(value)} 次/100人` : "不可计算";
const labels: Record<string, string> = {
  enrolled_count: "报名人数",
  first_lesson_count: "首次学习人数",
  week_one_active_count: "开课首周活跃人数",
  assignment_started_count: "开始作业人数",
  assignment_submitted_count: "提交作业人数",
  completed_count: "完成课程人数",
  ENROLLED_TO_FIRST_LESSON: "报名 → 首次学习",
  FIRST_LESSON_TO_WEEK_ONE_ACTIVE: "首次学习 → 开课首周活跃",
  WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED: "开课首周活跃 → 开始作业",
  ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED: "开始作业 → 提交作业",
  ASSIGNMENT_SUBMITTED_TO_COMPLETED: "提交作业 → 完成课程",
  course_track: "课程方向",
  signup_source: "来源渠道",
  FOUNDATIONS: "基础课程",
  APPLIED: "应用课程",
  ORGANIC: "自然来源",
  PARTNER: "合作渠道",
  CAMPAIGN: "活动渠道",
  FIRST_LESSON_REMINDER: "首课提醒",
  ASSIGNMENT_CHECKLIST: "作业清单",
  GROUP_OFFICE_HOURS: "集中答疑",
  CUSTOM: "自行设计",
  REVENUE: "收入",
  SATISFACTION: "满意度",
  WITHDRAWAL_REASONS: "退课原因",
  COMPLETION_RATE: "整体完成率（完成 / 报名）",
  FIRST_LESSON_RATE: "首课率（首课 / 报名）",
  WEEK_ONE_ACTIVE_RATE: "开课首周活跃率（活跃 / 报名）",
  ASSIGNMENT_SUBMISSION_RATE: "作业提交率（提交 / 报名）",
  STARTER_COMPLETION_RATE: "已开始学习者完成率（完成 / 首课）",
  SUPPORT_CONTACTS_PER_100_ENROLLED: "每100名报名者的支持联系次数",
  "b2-metric": "B2 · 定义指标",
  "b3-funnel": "B3 · 定位漏斗",
  "b4-segment": "B4 · 细分比较",
};
export const baLabel = (value: string | number) =>
  labels[String(value)] || String(value);
export const metricTitle = (denominator: unknown) =>
  denominator === "first_lesson_count" ? "已开始学习者完成率" : "总体完成率";
export const segmentOptions = (dimension: unknown) =>
  dimension === "course_track"
    ? ["FOUNDATIONS", "APPLIED"]
    : dimension === "signup_source"
      ? ["ORGANIC", "PARTNER", "CAMPAIGN"]
      : [];
export function changeSegment(value: Answer, dimension: SegmentBy): Answer {
  const next: Answer = { ...value, segmentBy: dimension };
  delete next.prioritySegmentKey;
  return next;
}
const transitions = [
  "ENROLLED_TO_FIRST_LESSON",
  "FIRST_LESSON_TO_WEEK_ONE_ACTIVE",
  "WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED",
  "ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED",
  "ASSIGNMENT_SUBMITTED_TO_COMPLETED",
];
export function sortTransitions(
  values: FunnelResult["transitions"],
  mode: "LOSS" | "DELTA",
) {
  return [...values].sort((a, b) => {
    const av =
      mode === "LOSS" ? a.comparison.lossCount : a.deltaPercentagePoints;
    const bv =
      mode === "LOSS" ? b.comparison.lossCount : b.deltaPercentagePoints;
    const order =
      av === null
        ? bv === null
          ? 0
          : 1
        : bv === null
          ? -1
          : mode === "LOSS"
            ? bv - av
            : av - bv;
    return (
      order ||
      transitions.indexOf(a.transitionKey) -
        transitions.indexOf(b.transitionKey)
    );
  });
}
const numeratorBySuccess: Record<SuccessMetric, StageKey> = {
  COMPLETION_RATE: "completed_count",
  FIRST_LESSON_RATE: "first_lesson_count",
  WEEK_ONE_ACTIVE_RATE: "week_one_active_count",
  ASSIGNMENT_SUBMISSION_RATE: "assignment_submitted_count",
  STARTER_COMPLETION_RATE: "completed_count",
};
export function actionBaseline(
  context: BaActionContext | undefined,
  metric: unknown,
) {
  if (
    !context ||
    typeof metric !== "string" ||
    !(metric in numeratorBySuccess) ||
    (metric === "STARTER_COMPLETION_RATE" &&
      context.parameters.denominator !== "first_lesson_count")
  )
    return null;
  const numerator =
      context.comparison.stageCounts[
        numeratorBySuccess[metric as SuccessMetric]
      ],
    denominator =
      context.comparison.stageCounts[
        metric === "STARTER_COMPLETION_RATE"
          ? "first_lesson_count"
          : "enrolled_count"
      ];
  return denominator > 0
    ? { numerator, denominator, rate: numerator / denominator }
    : null;
}
export function actionIssue(
  answer: Answer,
  context: BaActionContext | undefined,
): string {
  if (!context) return "尚无可计算基线，请返回 B4 获取当前已复核结果。";
  if (answer.targetSegmentKey !== context.prioritySegmentKey)
    return "目标群体须与当前 B4 已保存选择一致。";
  const baseline = actionBaseline(context, answer.successMetric);
  if (!baseline || context.comparison.stageCounts.enrolled_count <= 0)
    return "尚无可计算基线，请更换指标或返回上游调整窗口。";
  const pp = answer.targetChangePercentagePoints;
  if (typeof pp !== "number" || !Number.isFinite(pp) || pp <= 0 || pp > 100)
    return "请填写大于0且不超过100的目标提升（百分点）。";
  if (baseline.rate * 100 + pp > 100)
    return "基线加上学生期望提升不得超过100%；这不是效果预测。";
  if (
    answer.guardrailMetric !== "SUPPORT_CONTACTS_PER_100_ENROLLED" ||
    typeof answer.guardrailMaximum !== "number" ||
    !Number.isFinite(answer.guardrailMaximum) ||
    answer.guardrailMaximum < 0
  )
    return "支持联系护栏上限须为非负数，单位为次/100人。";
  if (![28, 42].includes(answer.reviewAfterDays as number))
    return "请选择28或42天复盘；统计仍采用每人入组后的前28天。";
  return "";
}
