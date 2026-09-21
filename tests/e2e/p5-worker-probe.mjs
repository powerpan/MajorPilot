import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const bytes = readFileSync(
  new URL(
    "../../content/ba-learning/1.0.0/weekly-funnel.json",
    import.meta.url,
  ),
);
const payload = {
  template: "ba-analysis-v1",
  operationKey: "ba-metric",
  rows: JSON.parse(bytes),
  datasetSha256: createHash("sha256").update(bytes).digest("hex"),
  parameters: {
    numerator: "completed_count",
    denominator: "enrolled_count",
    baselineStartWeek: 1,
    baselineEndWeek: 6,
    comparisonStartWeek: 7,
    comparisonEndWeek: 12,
  },
};
for (const channel of ["chrome", "msedge"]) {
  const browser = await chromium.launch({
    channel,
    headless: true,
    chromiumSandbox: true,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.goto("http://localhost:15173/");
    const result = await page.evaluate(async (payload) => {
      const nonce = crypto.randomUUID(),
        frame = document.createElement("iframe");
      frame.sandbox.add("allow-scripts");
      frame.src = "http://127.0.0.1:15175/#" + nonce;
      document.body.append(frame);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          window.removeEventListener("message", receive);
          reject(Error("Pinned BA worker timeout"));
        }, 15000);
        function receive(event) {
          if (
            event.source !== frame.contentWindow ||
            event.origin !== "null" ||
            event.data?.nonce !== nonce
          )
            return;
          if (event.data.type === "MP_EXECUTOR_READY")
            frame.contentWindow.postMessage(
              { type: "MP_EXECUTE", nonce, ...payload },
              "*",
            );
          if (event.data.type === "MP_EXECUTOR_RESULT") {
            clearTimeout(timer);
            window.removeEventListener("message", receive);
            resolve(event.data.result);
          }
        }
        window.addEventListener("message", receive);
      });
    }, payload);
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.engine, "ba-metrics-v1");
    assert.equal(result.result.baseline.numeratorCount, 100);
    assert.equal(result.result.comparison.denominatorCount, 179);
    const frame = page
      .frames()
      .find((value) => value.url().startsWith("http://127.0.0.1:15175/"));
    const capability = await frame.evaluate(async () => {
      const url = URL.createObjectURL(
        new Blob(
          [
            "postMessage({secure:isSecureContext,subtle:typeof crypto!=='undefined'&&!!crypto.subtle})",
          ],
          { type: "text/javascript" },
        ),
      );
      const worker = new Worker(url);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          URL.revokeObjectURL(url);
          reject(Error("Capability probe timeout"));
        }, 5000);
        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve(event.data);
        };
      });
    });
    assert.equal(capability.subtle, false);
    assert.equal(capability.secure, false);
    console.log(
      JSON.stringify({
        channel,
        scope: "no-account actual pinned opaque BA Worker",
        status: "PASS",
        capability,
        baseline: result.result.baseline,
        comparison: result.result.comparison,
      }),
    );
  } finally {
    await browser.close();
  }
}
