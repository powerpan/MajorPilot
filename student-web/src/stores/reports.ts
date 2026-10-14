import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api, ApiError, errorText } from "../lib/api";
import { identityRequest, onIdentityChange, useAuth } from "./auth";
import { isReport } from "../lib/report-display";
import type {
  Report,
  ReportStatus,
  ReportGeneration,
  ComparisonResponse,
  ComparisonWaiting,
} from "../types/reports";

export interface ReportTarget {
  kind: "report" | "comparison" | "print";
  reportId?: string;
  expectedVersionId?: string;
}
export const useReports = defineStore("reports", () => {
  const report = ref<Report | null>(null),
    status = ref<ReportStatus | null>(null),
    generation = ref<ReportGeneration | null>(null),
    waiting = ref<ComparisonWaiting | null>(null);
  const loading = ref(false),
    refreshing = ref(false),
    error = ref(""),
    errorCode = ref(""),
    newVersionAvailable = ref(false);
  const sourceReadable = ref<Record<string, boolean>>({});
  const auth = useAuth();
  let target: ReportTarget | null = null,
    epoch = 0,
    controller: AbortController | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    delay = 2000;
  const preparing = computed(
    () =>
      !!waiting.value ||
      (!report.value &&
        !!status.value &&
        ["PENDING", "GENERATING"].includes(status.value.status)) ||
      generation.value?.status === "GENERATING",
  );
  function stop() {
    clearTimeout(timer);
    timer = undefined;
  }
  function clear() {
    epoch += 1;
    controller?.abort();
    controller = null;
    stop();
    target = null;
    report.value = null;
    status.value = null;
    generation.value = null;
    waiting.value = null;
    sourceReadable.value = {};
    loading.value = false;
    refreshing.value = false;
    error.value = "";
    errorCode.value = "";
    newVersionAvailable.value = false;
  }
  onIdentityChange(clear);
  async function request<T>(path: string, issuedAt: number) {
    const ticket = identityRequest();
    try {
      const value = await api<T>(path, {
        signal: controller
          ? AbortSignal.any([ticket.signal, controller.signal])
          : ticket.signal,
      });
      ticket.assertCurrent();
      if (issuedAt !== epoch) throw new ApiError(409, "IDENTITY_CHANGED");
      return value;
    } finally {
      ticket.finish();
    }
  }
  function fail(cause: unknown, issuedAt: number) {
    if (issuedAt !== epoch) return;
    if (
      cause instanceof ApiError &&
      (cause.status === 401 ||
        (cause.status === 403 &&
          ["ACCOUNT_LOCKED", "EMAIL_NOT_VERIFIED"].includes(cause.code)))
    ) {
      auth.expire();
      return;
    }
    error.value = errorText(cause);
    errorCode.value = cause instanceof ApiError ? cause.code : "REQUEST_FAILED";
  }
  async function inspectSources(body: Report, issuedAt: number) {
    const entries = await Promise.all(
      body.sources
        .filter((item) => item.sourceReport)
        .map(async (item) => {
          const source = item.sourceReport!;
          try {
            const current = await request<ReportStatus>(
              `/api/app/v1/reports/${source.reportId}/status`,
              issuedAt,
            );
            return [
              source.reportVersionId,
              current.status === "READY" &&
                current.currentVersionId === source.reportVersionId,
            ] as const;
          } catch (cause) {
            if (
              cause instanceof ApiError &&
              (cause.status === 401 ||
                (cause.status === 403 &&
                  ["ACCOUNT_LOCKED", "EMAIL_NOT_VERIFIED"].includes(
                    cause.code,
                  )))
            )
              throw cause;
            return [source.reportVersionId, false] as const;
          }
        }),
    );
    if (
      issuedAt === epoch &&
      report.value?.reportVersionId === body.reportVersionId
    )
      sourceReadable.value = Object.fromEntries(entries);
  }
  function accept(body: Report, issuedAt: number) {
    if (
      target?.expectedVersionId &&
      body.reportVersionId !== target.expectedVersionId
    )
      throw new ApiError(409, "REPORT_VERSION_CHANGED");
    report.value = body;
    waiting.value = null;
    if (body.reportType === "COMPARISON")
      void inspectSources(body, issuedAt).catch((cause) =>
        fail(cause, issuedAt),
      );
  }
  function schedule() {
    stop();
    if (
      !target ||
      target.kind === "print" ||
      document.visibilityState !== "visible" ||
      newVersionAvailable.value
    )
      return;
    if (preparing.value || report.value) {
      timer = setTimeout(() => void refreshStatus(), delay);
      delay = Math.min(10000, delay + 2000);
    }
  }
  async function open(next: ReportTarget) {
    clear();
    target = { ...next };
    controller = new AbortController();
    const issuedAt = epoch;
    loading.value = true;
    delay = 2000;
    try {
      if (next.kind === "print" && !next.expectedVersionId)
        throw new ApiError(422, "REPORT_PRINT_VERSION_REQUIRED");
      await auth.refresh(true);
      if (issuedAt !== epoch) return;
      if (!auth.me) throw new ApiError(401, "AUTH_REQUIRED");
      if (next.kind === "comparison") {
        const value = await request<ComparisonResponse>(
          "/api/app/v1/comparison-report",
          issuedAt,
        );
        if (value.state === "READY") {
          generation.value = value.generation;
          accept(value.report, issuedAt);
        } else waiting.value = value;
      } else {
        const suffix =
          next.kind === "print"
            ? `/print${next.expectedVersionId ? `?expectedReportVersionId=${encodeURIComponent(next.expectedVersionId)}` : ""}`
            : "";
        const value = await request<Report | ReportStatus>(
          `/api/app/v1/reports/${next.reportId}${suffix}`,
          issuedAt,
        );
        if (isReport(value)) accept(value, issuedAt);
        else {
          status.value = value;
          generation.value = value.generation;
        }
        if (report.value && next.kind !== "print") await readStatus(issuedAt);
      }
    } catch (cause) {
      fail(cause, issuedAt);
    } finally {
      if (issuedAt === epoch) {
        loading.value = false;
        schedule();
      }
    }
  }
  async function readStatus(issuedAt: number) {
    if (!target) return;
    if (target.kind === "comparison") {
      const value = await request<ComparisonResponse>(
        "/api/app/v1/comparison-report",
        issuedAt,
      );
      if (value.state === "READY") {
        generation.value = value.generation;
        if (!report.value) accept(value.report, issuedAt);
        else if (report.value.reportVersionId !== value.report.reportVersionId)
          newVersionAvailable.value = true;
      } else if (!report.value) waiting.value = value;
      return;
    }
    const value = await request<ReportStatus>(
      `/api/app/v1/reports/${target.reportId}/status`,
      issuedAt,
    );
    status.value = value;
    generation.value = value.generation;
    if (
      report.value &&
      value.currentVersionId &&
      value.currentVersionId !== report.value.reportVersionId
    )
      newVersionAvailable.value = true;
    if (!report.value && value.status === "READY") {
      const body = await request<Report>(
        `/api/app/v1/reports/${target.reportId}`,
        issuedAt,
      );
      accept(body, issuedAt);
    }
    if (!report.value && value.status === "FAILED")
      throw new ApiError(409, value.generation?.safeCode === "PILOT_REPORT_LIMIT" ? "PILOT_REPORT_LIMIT" : "REPORT_GENERATION_FAILED");
  }
  async function refreshStatus() {
    if (!target || refreshing.value || loading.value || target.kind === "print")
      return;
    const issuedAt = epoch;
    refreshing.value = true;
    error.value = "";
    errorCode.value = "";
    try {
      await readStatus(issuedAt);
    } catch (cause) {
      fail(cause, issuedAt);
    } finally {
      if (issuedAt === epoch) {
        refreshing.value = false;
        schedule();
      }
    }
  }
  function refreshContent() {
    if (target) return open({ ...target, expectedVersionId: undefined });
  }
  function visibility() {
    if (document.visibilityState === "hidden") stop();
    else if (target) schedule();
  }
  document.addEventListener("visibilitychange", visibility);
  return {
    report,
    status,
    generation,
    waiting,
    loading,
    refreshing,
    error,
    errorCode,
    newVersionAvailable,
    sourceReadable,
    preparing,
    open,
    clear,
    refreshStatus,
    refreshContent,
  };
});
