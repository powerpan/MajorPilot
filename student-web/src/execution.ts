export type ExecutionTemplate =
  | "summary-v1"
  | "timeout-probe-v1"
  | "isolation-probe-v1"
  | "output-limit-probe-v1";
export interface ExecutionResult {
  status: "SUCCESS" | "ERROR";
  code?: string;
  engine: "fixed-calculator-v1";
  result?: Record<string, unknown>;
  elapsedMs: number;
}

const executorOrigin = "http://127.0.0.1:15175";
export async function execute(
  template: ExecutionTemplate,
  values: number[],
): Promise<ExecutionResult> {
  if (new TextEncoder().encode(JSON.stringify(values)).length > 1024 * 1024)
    throw new Error("INPUT_LIMIT");
  const nonce = crypto.randomUUID();
  const started = performance.now();
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "隔离的可信计算器";
  frame.sandbox.add("allow-scripts");
  frame.referrerPolicy = "no-referrer";
  frame.src = `${executorOrigin}/#${nonce}`;
  return await new Promise((resolve, reject) => {
    const clean = () => {
      window.removeEventListener("message", receive);
      clearTimeout(deadline);
      frame.remove();
    };
    const deadline = setTimeout(() => {
      clean();
      reject(new Error("EXECUTOR_BOOT_TIMEOUT"));
    }, 15000);
    const receive = (event: MessageEvent) => {
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
          { type: "MP_EXECUTE", nonce, template, values },
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
    document.body.appendChild(frame);
  });
}
