import type { MajorCode, Decision } from "../types";
import type { Run } from "../types/workspace";
import type { ReportSummary } from "../types/reports";

/** Existing previews remain previews. Only the server may admit one to the product flow. */
export function isProductRun(run: Run & { productEligible?: boolean }): boolean {
  return run.contentKind === "MAJOR" &&
    (run.runMode === "STANDARD" || run.productEligible === true);
}

/** Presentation only: never mutate pinned manifests, stored answers or evidence. */
export function productInstructions(run: Run | null | undefined, text: string | undefined): string | undefined {
  if (!run || !isProductRun(run)) return text;
  return text?.replace("本工程预览尚待专业审核与真实用户计时。", "本次体验的专业审核与真实用户计时尚待完成。");
}

export function productRun(runs: Run[], code: MajorCode): Run | undefined {
  let eligible = runs.filter((run) => isProductRun(run) &&
    run.majorCode === code && run.status !== "REPLACED");
  const edition=Math.max(1,...eligible.map(run=>run.experienceEdition||1));
  eligible=eligible.filter(run=>(run.experienceEdition||1)===edition);
  // A completed experience is not an invitation to silently start it again.
  return [...eligible].reverse().find((run) => run.status === "CLOSED") || eligible.at(-1);
}

/** Keep old unfinished work reachable after explicitly creating a new edition. */
export function historicalProductRuns(runs: Run[]): Run[] {
  return runs.filter(run => isProductRun(run) && run.status !== "REPLACED" && !!run.taskVersionId &&
    (run.experienceEdition || 1) < (productRun(runs, run.majorCode as MajorCode)?.experienceEdition || 1));
}

export function currentDecisionFor(decision: Decision | null | undefined,
  recommendationId: string | undefined, code: MajorCode): boolean {
  return !!decision && decision.selectedMajorCode === code &&
    decision.recommendationId === recommendationId;
}

export function productAction(run: Run | undefined, report: ReportSummary | undefined,
  short: string, available: boolean): string {
  if (run?.status === "CLOSED") return report?.currentVersionId ? "查看体验报告" : "查看报告进度";
  if (run?.status === "PAUSED") return `继续 ${short} 体验`;
  if (run?.status === "TASK_COMPLETED") return "完成体验反思";
  if (run?.status === "IN_PROGRESS") return `继续 ${short} 体验`;
  if (run || available) return `开始 ${short} 体验`;
  return "了解这个方向";
}

/** Resolve the exact source run, not the latest run for the same major. */
export function reportEditionLabel(report: ReportSummary, runs: Run[]): string {
  const source = report.sourceRunId ? runs.find(run => run.runId === report.sourceRunId) : undefined;
  if (!source) return "";
  return (source.experienceEdition || 1) >= 2 ? "方法引导版体验" : "旧版体验 · 原记录保留";
}

export const runStatusLabel: Record<Run["status"], string> = {
  READY: "准备开始", IN_PROGRESS: "进行中", TASK_COMPLETED: "等待反思",
  PAUSED: "已暂停", CLOSED: "体验已完成", REPLACED: "已被恢复体验替换",
};
