export type ExecutionTemplate =
  | "summary-v1"
  | "demo-summary-v1"
  | "crash-probe-v1"
  | "timeout-probe-v1"
  | "isolation-probe-v1"
  | "output-limit-probe-v1";
import type {
  Model,
  Config,
  Sample,
} from "../../shared/classifier/classifier-v1.mjs";
import type {
  LearnerRow,
  Operation,
  Parameters,
} from "../../shared/ds/ds-stats-v1.mjs";
import type {
  Operation as BaOperation,
  ParametersByOperation,
  WeeklyFunnelRow,
} from "../../shared/ba/ba-metrics-v1.mjs";
export interface ExecutionResult {
  status: "SUCCESS" | "ERROR";
  code?: string;
  engine:
    | "fixed-calculator-v1"
    | "classifier-v1"
    | "ds-stats-v1"
    | "ba-metrics-v1";
  result?: Record<string, unknown>;
  elapsedMs: number;
}

const executorOrigin = "http://127.0.0.1:15175";
export async function execute(
  template: ExecutionTemplate,
  values: number[],
  options: {
    parameters?: { multiplier: 1 | 2 | 3; include: "ALL" | "FIRST_TWO" };
    signal?: AbortSignal;
  } = {},
): Promise<ExecutionResult> {
  return sendExecution(
    {
      template,
      values,
      ...(options.parameters ? { parameters: options.parameters } : {}),
    },
    options.signal,
  );
}
export function executeClassifier(
  model: Model,
  config: Config,
  samples: Sample[],
  signal?: AbortSignal,
) {
  return sendExecution(
    { template: "classifier-practice-v1", model, config, samples },
    signal,
  );
}
export function executeDs(
  operationKey: Operation,
  rows: LearnerRow[],
  parameters: Parameters,
  datasetSha256: string,
  signal?: AbortSignal,
) {
  return sendExecution(
    {
      template: "ds-analysis-v1",
      operationKey,
      rows,
      parameters,
      datasetSha256,
    },
    signal,
  );
}
export function executeBa<O extends BaOperation>(
  operationKey: O,
  rows: WeeklyFunnelRow[],
  parameters: ParametersByOperation[O],
  datasetSha256: string,
  signal?: AbortSignal,
) {
  return sendExecution(
    {
      template: "ba-analysis-v1",
      operationKey,
      rows,
      parameters,
      datasetSha256,
    },
    signal,
  );
}
async function sendExecution(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ExecutionResult> {
  // The execution contract is JSON-only. Snapshot before asynchronous iframe
  // startup so Vue proxies and later editor mutations never cross the boundary.
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).length > 1024 * 1024)
    throw new Error("INPUT_LIMIT");
  const snapshot = JSON.parse(serialized) as Record<string, unknown>;
  const nonce = crypto.randomUUID();
  const started = performance.now();
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "隔离的可信计算器";
  frame.sandbox.add("allow-scripts");
  frame.referrerPolicy = "no-referrer";
  frame.src = `${executorOrigin}/#${nonce}`;
  return await new Promise((resolve, reject) => {
    let settled = false;
    const clean = () => {
      settled = true;
      window.removeEventListener("message", receive);
      signal?.removeEventListener("abort", abort);
      clearTimeout(deadline);
      frame.remove();
    };
    const abort = () => {
      clean();
      reject(new Error("EXECUTION_CANCELLED"));
    };
    const deadline = setTimeout(() => {
      clean();
      reject(new Error("EXECUTOR_BOOT_TIMEOUT"));
    }, 15000);
    const receive = (event: MessageEvent) => {
      if (settled) return;
      // The sandbox deliberately has an opaque origin. Both the exact window and
      // a fresh unpredictable nonce must match; no other null-origin is trusted.
      if (
        event.source !== frame.contentWindow ||
        event.origin !== "null" ||
        event.data?.nonce !== nonce
      )
        return;
      if (event.data?.type === "MP_EXECUTOR_READY") {
        frame.contentWindow?.postMessage(
          { type: "MP_EXECUTE", nonce, ...snapshot },
          "*",
        );
      } else if (event.data?.type === "MP_EXECUTOR_RESULT") {
        if (!["SUCCESS", "ERROR"].includes(event.data.result?.status)) return;
        clean();
        resolve({
          ...event.data.result,
          elapsedMs: Math.round(performance.now() - started),
        });
      }
    };
    window.addEventListener("message", receive);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    document.body.appendChild(frame);
  });
}
