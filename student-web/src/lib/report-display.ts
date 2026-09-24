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
  (value.schemaVersion === "report-v1" || value.schemaVersion === "method-report-v1");
export function generationExplanation(phase: string | undefined) {
  if (phase === 'REVIEW_REQUESTED') return '正在对照题目和你的原始回答复核分析，检查有没有误解、遗漏或难懂的表述。';
  if (phase === 'REPAIR_REQUESTED') return '正在补全报告内容和引用依据，检查通过后才会展示。';
  if (phase === 'INITIAL_REQUESTED') return '正在结合你的答案、修改和已提供的帮助逐项分析。完整分析与复核可能需要十几分钟，可以离开，稍后回来查看。';
  return '你的提交已保存，正在安排报告处理。无需停留在这个页面。';
}
export function reportChapters(report: Report) {
  return report.schemaVersion === 'method-report-v1' ? [
    {sectionKey:'METHOD_OVERVIEW',title:'这次你做了什么'},
    {sectionKey:'METHOD_PROCESS',title:'沿着过程回看'},
    {sectionKey:'METHOD_NEXT',title:'这与专业选择有什么关系'},
  ] : report.sections;
}
/** Display only a known, server-labelled selection; never rewrite free-text excerpts. */
export function reportSelectionLabel(majorCode: string, quote: {label:string;quote:string}): string | null {
  const [prefix, question, extra] = quote.label.split(' · ');
  if (extra !== undefined) return null;
  const stages = ['初次提交', '修订提交', '新情境提交'];
  if (majorCode === 'BUSINESS_ANALYTICS' && question === '这一步你选择' &&
    [...stages, '先试一个办法：怎么看有没有用？'].includes(prefix)) {
    const labels: Record<string,string> = {INFORMATION:'先补充信息', SMALL_TRIAL:'小范围试一个办法'};
    return Object.hasOwn(labels,quote.quote) ? labels[quote.quote] : null;
  }
  const title = ({AI:'交付建议，再换个情境想一想', DATA_SCIENCE:'写一份简短结论，再试一道新题', BUSINESS_ANALYTICS:'交付一页行动建议，再换个问题'} as Record<string,string>)[majorCode];
  if (title && question === '这道新情境小题（可选）' && [...stages,title].includes(prefix)) {
    const labels: Record<string,string> = {ANSWER:'尝试回答', SKIP:'这次先不回答，保留为未作答'};
    return Object.hasOwn(labels,quote.quote) ? labels[quote.quote] : null;
  }
  return null;
}
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
