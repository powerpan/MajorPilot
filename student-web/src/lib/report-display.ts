import type { ClaimType, DimensionKey, Report } from "../types/reports";
export const claimLabels: Record<ClaimType, string> = {
  OBSERVED_FACT: "事实",
  STUDENT_SELF_REPORT: "你的自述",
  BOUNDED_INTERPRETATION: "本次解释",
  LIMITATION: "限制",
  NEXT_STEP: "下一步",
};
export const dimensions: { key: DimensionKey; label: string }[] = [
  { key: "PROBLEM_INTEREST", label: "问题类型兴趣" },
  { key: "QUANTITATIVE_COMFORT", label: "定量信息舒适程度" },
  { key: "UNCERTAINTY_HANDLING", label: "不确定信息处理" },
  { key: "WORK_FOCUS", label: "对模型、数据或行动决策的关注" },
  { key: "HELP_AND_ITERATION", label: "遇到困难时的求助和迭代" },
  { key: "EXPLANATION_INTEREST", label: "解释表达结果的兴趣" },
  { key: "CONTINUATION_WILLINGNESS", label: "继续类似任务的意愿" },
];
export const waitingLabels = {
  NEED_TWO_MAJORS: "再完成一个不同专业，才能开始比较。",
  WAITING_SOURCE_REPORTS: "体验已完成，正在等待各专业报告准备就绪。",
  SOURCE_REPORT_FAILED:
    "有一份来源报告准备异常。已有体验进度不会丢失，请稍后刷新。",
  COMPARISON_GENERATING: "比较报告正在准备，你可以安全离开，稍后回来查看。",
  COMPARISON_FAILED: "比较报告准备异常。已有专业报告仍可阅读，请稍后刷新。",
};
export const isReport = (value: unknown): value is Report =>
  !!value &&
  typeof value === "object" &&
  "schemaVersion" in value &&
  value.schemaVersion === "report-v1";
export function reportDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}
