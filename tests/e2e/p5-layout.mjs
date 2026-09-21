// UI-only regression. Every API request is intercepted; no live account or business acceptance.
// Run using the project Node24: data/tools/node/bin/node tests/e2e/p5-layout.mjs
// Native macOS headless popup arrow-key selection is not asserted; Tab/focus and selectOption are separate checks.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { calculateBa } from "../../shared/ba/ba-metrics-v1.mjs";
const base = fileURLToPath(new URL("../../", import.meta.url)),
  out = "/tmp/majorpilot-p5-keyboard";
const manifest = JSON.parse(
  await readFile(base + "content/ba-learning/1.0.0/manifest.json", "utf8"),
);
const fixture = JSON.parse(
  await readFile(base + "contracts/examples/p5-ba-run.json", "utf8"),
);
const rows = JSON.parse(
  await readFile(base + "content/ba-learning/1.0.0/weekly-funnel.json", "utf8"),
);
const metric = Object.fromEntries(
  Object.entries(fixture.responses["b2-metric"]).filter(
    ([key]) => key !== "metricReason",
  ),
);
const parameters = {
  ...metric,
  focusTransitionKey: "ENROLLED_TO_FIRST_LESSON",
  segmentBy: "course_track",
};
const datasetSha256 = manifest.assets.find(
  (item) => item.assetKey === "weekly-funnel",
).sha256;
const segments = calculateBa("ba-segments", rows, parameters, {
  datasetSha256,
});
await mkdir(out, { recursive: true });
const reports = [];
async function tabTo(page, name) {
  const visited = [];
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      name: document.activeElement?.getAttribute("name"),
    }));
    visited.push(focused);
    if (focused.name === name) return visited;
  }
  assert.fail(`Tab did not reach ${name}: ${JSON.stringify(visited)}`);
}
for (const channel of ["chrome", "msedge"]) {
  const browser = await chromium.launch({
    channel,
    headless: true,
    chromiumSandbox: true,
  });
  const deadline = setTimeout(() => void browser.close(), 90000);
  try {
    for (const [key, dimension] of [
      ["b2-metric"],
      ["b3-funnel"],
      ["b4-segment", "course_track"],
      ["b4-segment", "signup_source"],
      ["b6-action"],
    ]) {
      const caseKey = key + (dimension ? "-" + dimension : ""),
        caseParameters = {
          ...parameters,
          segmentBy: dimension || "course_track",
        };
      const context = await browser.newContext({
          viewport: { width: 1536, height: 1024 },
        }),
        page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [],
        warnings = [],
        intercepted = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type()))
          warnings.push(message.text());
      });
      const definition = manifest.steps.find((item) => item.stepKey === key);
      const sourceParameters = Object.fromEntries(
        Object.entries(metric).filter(([k]) => k.endsWith("Week")),
      );
      const bindings = (
        manifest.operations.find(
          (item) => item.operationKey === definition.operationKey,
        )?.inputBindings || []
      ).map((item) => ({
        ...item,
        sourceRevision: 1,
        value: fixture.responses[item.sourceStepKey][item.sourceField],
      }));
      const sourceRevisions = Object.fromEntries(
        bindings.map((item) => [item.sourceStepKey, item.sourceRevision]),
      );
      const result = definition.operationKey
        ? calculateBa(
            definition.operationKey,
            rows,
            key === "b2-metric"
              ? metric
              : key === "b4-segment"
                ? caseParameters
                : sourceParameters,
            { datasetSha256 },
          )
        : null;
      let revision = 1;
      const run = {
        runId: "keyboard-mock-only",
        runMode: "REVIEW_PREVIEW",
        contentKind: "MAJOR",
        majorCode: "BUSINESS_ANALYTICS",
        status: "IN_PROGRESS",
        revision,
        taskVersionId: manifest.taskVersionId,
        currentStepKey: key,
        readOnly: false,
        steps: manifest.steps.map((item) => ({
          stepKey: item.stepKey,
          status: item.stepKey === key ? "IN_PROGRESS" : "COMPLETED",
          revision: 1,
        })),
      };
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        intercepted.push({
          method: route.request().method(),
          path: url.pathname,
        });
        let data;
        if (url.pathname.endsWith("/me"))
          data = {
            studentId: "mock-only",
            email: "mock@example.invalid",
            status: "ACTIVE",
            emailVerified: true,
            canStartExperience: true,
          };
        else if (url.pathname.endsWith("/csrf"))
          data = { csrfToken: "mock-ui-only-not-a-real-token" };
        else if (url.pathname.endsWith("/task")) data = manifest;
        else if (url.pathname.includes("/task/assets/")) {
          const asset = url.pathname.split("/").at(-1);
          return route.fulfill({
            contentType: "application/json",
            body: await readFile(
              base + "content/ba-learning/1.0.0/" + asset + ".json",
              "utf8",
            ),
          });
        } else if (url.pathname.endsWith("/response"))
          data = {
            stepKey: key,
            revision: ++revision,
            runRevision: revision,
            savedAt: new Date().toISOString(),
            validationStatus: "VALID",
            invalidatedStepKeys: [],
          };
        else if (url.pathname.includes("/steps/"))
          data = {
            stepKey: key,
            definition,
            readOnly: false,
            revision,
            responseSchemaVersion: "ba-response-v1",
            response:
              key === "b2-metric"
                ? metric
                : key === "b4-segment"
                  ? { segmentBy: dimension }
                  : {},
            inputBindings: bindings,
            executions: result
              ? [
                  {
                    executionId: "mock-only",
                    status: "SUCCEEDED",
                    trustLevel: "SERVER_VERIFIED",
                    inputRevision: 1,
                    appliedToRevision: 1,
                    sourceRevisions,
                    appliedSourceRevisions: sourceRevisions,
                    remainingEvaluations: 29,
                    result,
                  },
                ]
              : [],
            ...(key === "b6-action"
              ? {
                  baActionContext: {
                    parameters,
                    prioritySegmentKey: "APPLIED",
                    comparison: segments.segments.find(
                      (item) => item.segmentKey === "APPLIED",
                    ).comparison,
                    sourceRevisions: {
                      "b2-metric": 1,
                      "b3-funnel": 1,
                      "b4-segment": 1,
                    },
                  },
                }
              : {}),
          };
        else data = run;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data,
            meta: { requestId: "keyboard-mock-only", apiVersion: "v1" },
          }),
        });
      });
      await page.goto("http://localhost:15173/app/runs/keyboard-mock-only");
      await page.locator(".ba-workspace").waitFor();
      await page
        .locator('[data-testid="save-status"]')
        .filter({ hasText: "已保存" })
        .waitFor();
      assert.ok((await page.title()).includes("MajorPilot"));
      assert.equal(await page.locator("vite-error-overlay").count(), 0);
      assert.equal(
        await page.locator(".workspace-title-row h1").innerText(),
        definition.title,
      );
      const fonts = await page.evaluate(() => {
        const read = (selector) =>
          [...document.querySelectorAll(selector)].map((node) => ({
            fontSize: parseFloat(getComputedStyle(node).fontSize),
            lineHeight: getComputedStyle(node).lineHeight,
          }));
        return {
          heading: read(".workspace-title-row h1"),
          body: read(".workspace-instructions"),
          controls: read(
            ".ba-field input,.ba-field select,.ba-field textarea,.ba-sort select",
          ),
          table: read(".ba-workspace th,.ba-workspace td"),
          axis: read(".ba-chart svg text"),
        };
      });
      for (const category of ["heading", "body", "controls"])
        assert.ok(
          fonts[category].length > 0,
          `${key}: empty ${category} font sample`,
        );
      for (const item of fonts.heading) assert.ok(item.fontSize >= 40);
      for (const item of fonts.body) assert.ok(item.fontSize >= 18);
      for (const item of fonts.controls) assert.ok(item.fontSize >= 16);
      for (const item of [...fonts.table, ...fonts.axis])
        assert.ok(item.fontSize >= 14);
      const record = {
        scope: "MOCK UI ONLY — no account or live business state",
        channel,
        step: caseKey,
        identity: true,
        overlay: false,
        fonts: Object.fromEntries(
          Object.entries(fonts).map(([name, values]) => [
            name,
            {
              count: values.length,
              min: values.length
                ? Math.min(...values.map((value) => value.fontSize))
                : null,
            },
          ]),
        ),
      };
      record.widthChecks = [];
      for (const width of [1536, 1366, 1100, 1024]) {
        await page.setViewportSize({ width, height: 1024 });
        await page.waitForTimeout(120);
        const bounds = await page.evaluate(() => {
          const body = document.querySelector(".workspace-main-body"),
            rect = body.getBoundingClientRect(),
            style = getComputedStyle(body),
            left = rect.left + parseFloat(style.paddingLeft),
            right = rect.right - parseFloat(style.paddingRight);
          return {
            width: innerWidth,
            left,
            right,
            headerTop: document
              .querySelector(".workspace-header")
              .getBoundingClientRect().top,
            footerBottom: document
              .querySelector(".workspace-footer")
              .getBoundingClientRect().bottom,
            children: [
              ...document.querySelectorAll(
                ".ba-fields,.ba-analysis,.ba-field>select,.ba-chart",
              ),
            ].map((node) => ({
              element: node.className || node.tagName,
              name: node.getAttribute("name"),
              left: node.getBoundingClientRect().left,
              right: node.getBoundingClientRect().right,
            })),
            documentOverflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        assert.equal(bounds.documentOverflow, false);
        assert.ok(Math.abs(bounds.headerTop) <= 1);
        assert.ok(bounds.footerBottom <= 1025);
        assert.ok(bounds.children.length > 0);
        for (const child of bounds.children)
          assert.ok(
            child.left >= bounds.left - 1 && child.right <= bounds.right + 1,
            `${key} ${width} clipped: ${JSON.stringify(child)} vs ${bounds.left}..${bounds.right}`,
          );
        record.widthChecks.push(bounds);
        await page.screenshot({
          path: `${out}/${channel}-${caseKey}-${width}-mock.png`,
        });
      }
      await page.setViewportSize({ width: 1536, height: 1024 });
      if (key === "b2-metric") {
        await page.locator('select[name="numerator"]').focus();
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("name"),
          ),
          "denominator",
        );
        await page
          .locator('select[name="denominator"]')
          .selectOption("first_lesson_count");
        assert.equal(
          await page.locator('select[name="denominator"]').inputValue(),
          "first_lesson_count",
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("name"),
          ),
          "baselineStartWeek",
        );
        record.nativeSelectAndTab =
          "PASS: Tab traversal and native selectOption; macOS headless popup arrow keys not asserted";
      } else if (key === "b3-funnel") {
        await page.locator('select[name="funnelSort"]').focus();
        await page.locator('select[name="funnelSort"]').selectOption("DELTA");
        assert.equal(
          await page.locator('select[name="funnelSort"]').inputValue(),
          "DELTA",
        );
        record.tabPathToFocusTransition = await tabTo(
          page,
          "focusTransitionKey",
        );
        await page
          .locator('select[name="focusTransitionKey"]')
          .selectOption("ENROLLED_TO_FIRST_LESSON");
        assert.equal(
          await page.locator('select[name="focusTransitionKey"]').inputValue(),
          "ENROLLED_TO_FIRST_LESSON",
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("name"),
          ),
          "focusReason",
        );
        record.nativeSelectAndTab =
          "PASS: Tab traversal and native selectOption; macOS headless popup arrow keys not asserted";
      }
      if (key !== "b6-action") {
        const summary = page.locator(".ba-workspace details summary").first();
        await summary.focus();
        const before = await summary.evaluate(
          (node) => node.parentElement.open,
        );
        await page.keyboard.press("Space");
        assert.equal(
          await summary.evaluate((node) => node.parentElement.open),
          !before,
        );
        record.detailsSpace = "PASS";
        await page.screenshot({
          path: `${out}/${channel}-${caseKey}-keyboard-mock.png`,
        });
      }
      if (key === "b6-action") {
        await page.locator('select[name="actionKey"]').focus();
        await page
          .locator('select[name="actionKey"]')
          .selectOption("FIRST_LESSON_REMINDER");
        assert.equal(
          await page.locator('select[name="actionKey"]').inputValue(),
          "FIRST_LESSON_REMINDER",
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("name"),
          ),
          "actionDescription",
        );
        record.nativeSelectAndTab =
          "PASS: Tab traversal and native selectOption; macOS headless popup arrow keys not asserted";
        const long =
          "这是用于键盘可达性检查的长方案文字，不代表真实学生回答。\n".repeat(
            25,
          ) + "最后一行：验证结束。";
        const plan = page.locator('textarea[name="testPlan"]');
        await plan.fill(long);
        assert.equal(await plan.inputValue(), long);
        await plan.press(
          process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home",
        );
        assert.equal(await plan.evaluate((node) => node.selectionEnd), 0);
        await plan.press(
          process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End",
        );
        await page.locator(".workspace-main-body").hover();
        await page.mouse.wheel(0, 10000);
        await page.waitForTimeout(200);
        const geometry = await page.evaluate(() => {
          const textarea = document.querySelector('textarea[name="testPlan"]'),
            box = textarea.getBoundingClientRect(),
            footer = document
              .querySelector(".workspace-footer")
              .getBoundingClientRect(),
            body = document.querySelector(".workspace-main-body");
          return {
            textarea: {
              top: box.top,
              bottom: box.bottom,
              cursorAtEnd: textarea.selectionEnd === textarea.value.length,
              contentLength: textarea.value.length,
              scrollTop: textarea.scrollTop,
              clientHeight: textarea.clientHeight,
              scrollHeight: textarea.scrollHeight,
            },
            footer: { top: footer.top, bottom: footer.bottom },
            bodyAtEnd:
              body.scrollTop + body.clientHeight >= body.scrollHeight - 2,
            viewportHeight: innerHeight,
            headerTop: document
              .querySelector(".workspace-header")
              .getBoundingClientRect().top,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        console.log(
          JSON.stringify({
            scope: "MOCK UI ONLY",
            channel,
            step: key,
            longFormGeometry: geometry,
          }),
        );
        await page.screenshot({
          path: `${out}/${channel}-b6-long-end-mock.png`,
        });
        assert.ok(geometry.textarea.bottom <= geometry.footer.top);
        assert.ok(geometry.textarea.top >= 76);
        assert.ok(geometry.footer.bottom <= geometry.viewportHeight + 1);
        assert.equal(geometry.textarea.cursorAtEnd, true);
        assert.ok(
          geometry.textarea.scrollTop + geometry.textarea.clientHeight >=
            geometry.textarea.scrollHeight - 2,
        );
        assert.equal(geometry.bodyAtEnd, true);
        assert.equal(geometry.overflow, false);
        record.longForm = geometry;
        await page.setViewportSize({ width: 1024, height: 1024 });
        const opener = page.getByRole("button", {
          name: "需要提示？",
          exact: true,
        });
        await opener.focus();
        await page.keyboard.press("Enter");
        await page.locator(".workspace-help-drawer[open]").waitFor();
        assert.equal(
          await page.evaluate(() =>
            document
              .querySelector(".workspace-help-drawer")
              .contains(document.activeElement),
          ),
          true,
        );
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document
              .querySelector(".workspace-help-drawer")
              .contains(document.activeElement),
          ),
          true,
        );
        await page.screenshot({
          path: `${out}/${channel}-1024-drawer-keyboard-mock.png`,
        });
        await page.keyboard.press("Escape");
        assert.equal(
          await page.locator(".workspace-help-drawer[open]").count(),
          0,
        );
        assert.equal(
          await opener.evaluate((node) => document.activeElement === node),
          true,
        );
        record.drawerEnterTabEscapeFocus = "PASS";
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, []);
      record.consoleErrors = 0;
      record.interceptedRequests = intercepted.length;
      reports.push(record);
      console.log(JSON.stringify(record));
      await context.close();
    }
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
await writeFile(out + "/results.json", JSON.stringify(reports, null, 2));
console.log(
  "PASS: ten mock UI cases with 40 viewport checks, zero registration, all API routes intercepted; not an end-to-end business acceptance.",
);
