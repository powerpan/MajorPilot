import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  createFixtureScope,
  idempotency,
  expect,
} from "../../scripts/lib/local-student-fixture.mjs";
const fixture = JSON.parse(
  await readFile(
    new URL("../../contracts/examples/p5-ba-run.json", import.meta.url),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await readFile(
    new URL("../../content/ba-learning/1.0.0/manifest.json", import.meta.url),
    "utf8",
  ),
);
const output = "/tmp/majorpilot-p5-evidence";
await mkdir(output, { recursive: true });
const channels = process.argv.includes("--chrome-only")
  ? ["chrome"]
  : ["chrome", "msedge"];
const scope = createFixtureScope("p5-browser");
try {
  const accounts = [];
  for (const channel of channels) accounts.push(await scope.student());
  for (const [index, channel] of channels.entries()) {
    const browser = await chromium.launch({
      channel,
      headless: true,
      chromiumSandbox: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1536, height: 1024 },
      }),
      page = await context.newPage(),
      client = accounts[index].client;
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(30000);
    const deadline = setTimeout(() => {
      console.error(
        channel + ": 8-minute deadline; closing before exact cleanup",
      );
      void browser.close();
    }, 480000);
    const errors = [],
      consoleErrors = [],
      requests = [],
      cookies = [],
      responseChecks = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        ["warning", "error"].includes(message.type()) &&
        !message.text().startsWith("Failed to load resource")
      )
        consoleErrors.push(message.text());
    });
    page.on("dialog", (dialog) => dialog.accept());
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname === "127.0.0.1" && url.port === "15175")
        cookies.push(
          request.allHeaders().then((headers) => Boolean(headers.cookie)),
        );
      if (request.method() === "POST" && url.pathname.endsWith("/executions"))
        requests.push(request.postDataJSON());
    });
    page.on("response", (response) => {
      if (
        response.status() === 200 &&
        /\/experience-runs\/.+(?:\/task$|\/steps\/[^/]+$|\/executions$)/.test(
          new URL(response.url()).pathname,
        )
      )
        responseChecks.push(
          response
            .json()
            .then((value) =>
              assert.doesNotMatch(
                JSON.stringify(value),
                /canonical-events-private|review-private|golden-private/,
              ),
            )
            .catch((error) => error),
        );
    });
    const title = (key) =>
      page
        .getByRole("heading", {
          name:
            manifest.steps.find((value) => value.stepKey === key)?.title || key,
          exact: true,
        })
        .waitFor();
    const shot = (name) =>
      page.screenshot({ path: `${output}/${channel}-${name}.png` });
    const saved = () =>
      page.waitForFunction(
        () =>
          document.querySelector('[data-testid="save-status"]')?.textContent ===
          "已保存",
        undefined,
        { timeout: 12000 },
      );
    const top = async () => {
      await page.locator(".workspace-main-body").hover();
      const scroll = await page
        .locator(".workspace-main-body")
        .evaluate((node) => node.scrollTop);
      if (scroll > 0) await page.mouse.wheel(0, -Math.ceil(scroll));
      await page.waitForFunction(
        () => document.querySelector(".workspace-main-body")?.scrollTop === 0,
      );
      await page.locator(".workspace-title-row h1").click();
      const geometry = await page.evaluate(() => ({
        header: document
          .querySelector(".workspace-header")
          .getBoundingClientRect().top,
        footer: document
          .querySelector(".workspace-footer")
          .getBoundingClientRect().bottom,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        clippedChildren: (() => {
          const body = document.querySelector(".workspace-main-body");
          const rect = body.getBoundingClientRect(),
            style = getComputedStyle(body);
          const left = rect.left + parseFloat(style.paddingLeft),
            right = rect.right - parseFloat(style.paddingRight);
          return [
            ...document.querySelectorAll(
              ".ba-fields,.ba-analysis,.ba-field>select,.ba-chart",
            ),
          ]
            .filter((node) => {
              const child = node.getBoundingClientRect();
              return child.left < left - 1 || child.right > right + 1;
            })
            .map((node) => node.getAttribute("name") || node.className);
        })(),
      }));
      assert.ok(Math.abs(geometry.header) < 1);
      assert.ok(geometry.footer <= geometry.height + 1);
      assert.equal(geometry.overflow, false);
      assert.deepEqual(
        geometry.clippedChildren,
        [],
        "BA grid children must fit the center content, not merely avoid document overflow",
      );
    };
    const complete = async (next) => {
      await page
        .getByRole("button", { name: "完成此步骤", exact: true })
        .click();
      await title(next);
    };
    const selectStep = async (key) => {
      await page
        .locator(".workspace-steps nav")
        .getByRole("button")
        .filter({
          hasText: manifest.steps.find((value) => value.stepKey === key).title,
        })
        .click();
      await title(key);
    };
    const fill = async (answer) => {
      for (const [key, value] of Object.entries(answer)) {
        const node = page.locator(`[name="${key}"]`);
        if (typeof value === "boolean") await node.setChecked(value);
        else if (Array.isArray(value)) {
          for (const item of value)
            await page.locator(`input[name="${key}"][value="${item}"]`).check();
        } else if ((await node.first().getAttribute("type")) === "radio")
          await page.locator(`input[name="${key}"][value="${value}"]`).check();
        else if (
          (await node.first().evaluate((node) => node.tagName)) === "SELECT"
        )
          await node.selectOption(String(value));
        else await node.fill(String(value));
      }
    };
    const run = async () => {
      const pending = page.waitForResponse(
        (value) =>
          value.url().endsWith("/executions") &&
          value.request().method() === "POST",
      );
      await page
        .locator(".ba-run-actions")
        .getByRole("button", { name: /^计算/ })
        .click();
      const response = await pending,
        body = await response.json();
      assert.equal(response.status(), 200, body.error?.code);
      assert.equal(body.data.trustLevel, "SERVER_VERIFIED");
      assert.equal(body.data.result.schemaVersion, "ba-result-v1");
      await page.getByText(/服务端已复算确认 · 回答/).waitFor();
      return body.data;
    };
    let runPath, runUrl;
    try {
      await page.goto(
        "http://localhost:15173/login?returnTo=/app/review-previews",
      );
      await page
        .getByLabel("邮箱", { exact: true })
        .fill(accounts[index].email);
      await page
        .getByLabel("密码", { exact: true })
        .fill(accounts[index].password);
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page
        .locator(`a[href="/app/review-previews/${fixture.taskVersionId}"]`)
        .click();
      await title(manifest.title);
      await shot("introduction-1536");
      await page.getByText(/固定业务计算器；等价SQL说明只读、不执行/).waitFor();
      await page.getByRole("button", { name: "开始工程预览" }).click();
      await title("b1-context");
      runUrl = page.url();
      runPath = "/api/app/v1/experience-runs/" + runUrl.split("/").at(-1);
      assert.equal(
        await page.locator('textarea[name="businessQuestion"]').inputValue(),
        "",
      );
      await page
        .getByText("查看数据字典与72行合成业务表", { exact: true })
        .click();
      assert.equal(await page.locator(".ba-raw-table tbody tr").count(), 72);
      await fill(fixture.responses["b1-context"]);
      await complete("b2-metric");
      assert.equal(
        await page.locator('textarea[name="metricReason"]').inputValue(),
        "",
      );
      assert.equal(await page.locator(".ba-chart").count(), 0);
      await saved();
      await top();
      await shot("metric-empty-1536");
      // Invalid adjacent windows are rejected by the fixed Worker, not rendered as a success.
      await fill({ comparisonStartWeek: 6 });
      await page.getByRole("button", { name: "计算指标", exact: true }).click();
      await page
        .getByText(/请检查指标与批次范围/)
        .first()
        .waitFor();
      assert.equal(await page.locator(".ba-chart").count(), 0);
      await fill(fixture.responses["b2-metric"]);
      let result = await run();
      assert.equal(result.remainingEvaluations, 29);
      assert.equal(result.result.baseline.numeratorCount, 100);
      assert.equal(result.result.comparison.denominatorCount, 179);
      const first = result;
      result = await run();
      assert.equal(result.executionId, first.executionId);
      assert.equal(result.reused, first.reused);
      assert.deepEqual(result.result, first.result);
      await fill({
        metricReason:
          fixture.responses["b2-metric"].metricReason + " 我会核对合计分母。",
      });
      result = await run();
      assert.equal(result.reused, true);
      assert.equal(result.remainingEvaluations, 29);
      assert.equal(result.executionId, first.executionId);
      await fill({ denominator: "first_lesson_count" });
      result = await run();
      assert.equal(result.result.denominator, "first_lesson_count");
      await page
        .getByRole("heading", { name: "已开始学习者完成率", exact: true })
        .waitFor();
      assert.equal(result.remainingEvaluations, 28);
      await fill({
        baselineStartWeek: 2,
        baselineEndWeek: 6,
        comparisonStartWeek: 7,
        comparisonEndWeek: 11,
      });
      result = await run();
      assert.deepEqual(result.result.windows, {
        baseline: { startWeek: 2, endWeek: 6 },
        comparison: { startWeek: 7, endWeek: 11 },
      });
      const finalDenominator =
        channel === "msedge" ? "first_lesson_count" : "enrolled_count";
      await fill({
        ...fixture.responses["b2-metric"],
        denominator: finalDenominator,
      });
      result = await run();
      assert.equal(result.reused, true);
      await top();
      await shot("metric-result-1536");
      await page.locator(".ba-chart").scrollIntoViewIfNeeded();
      await shot("metric-trend-1536");
      await complete("b3-funnel");
      assert.equal(
        await page.locator('select[name="focusTransitionKey"]').inputValue(),
        "",
      );
      result = await run();
      assert.equal(result.remainingEvaluations, 29);
      assert.equal(result.result.stages.length, 6);
      assert.equal(result.result.transitions.length, 5);
      const sorted = (mode) =>
        [...result.result.transitions]
          .sort((a, b) => {
            const ai = result.result.transitions.indexOf(a),
              bi = result.result.transitions.indexOf(b);
            return (
              (mode === "LOSS"
                ? b.comparison.lossCount - a.comparison.lossCount
                : a.deltaPercentagePoints === null
                  ? b.deltaPercentagePoints === null
                    ? 0
                    : 1
                  : b.deltaPercentagePoints === null
                    ? -1
                    : a.deltaPercentagePoints - b.deltaPercentagePoints) ||
              ai - bi
            );
          })
          .map((row) => row.transitionKey);
      for (const mode of ["LOSS", "DELTA"]) {
        await page.locator('select[name="funnelSort"]').selectOption(mode);
        assert.deepEqual(
          await page
            .locator("[data-transition]")
            .evaluateAll((nodes) =>
              nodes.map((node) => node.dataset.transition),
            ),
          sorted(mode),
        );
        assert.equal(
          await page.locator('select[name="focusTransitionKey"]').inputValue(),
          "",
        );
      }
      await fill(fixture.responses["b3-funnel"]);
      result = await run();
      assert.equal(result.reused, true);
      assert.equal(result.remainingEvaluations, 29);
      await top();
      await shot("funnel-1536");
      await page.locator(".ba-chart").scrollIntoViewIfNeeded();
      await shot("funnel-chart-1536");
      await page.locator(".ba-transition-table").scrollIntoViewIfNeeded();
      await shot("funnel-table-1536");
      await complete("b4-segment");
      await fill(fixture.responses["b4-segment"]);
      result = await run();
      assert.equal(result.result.segmentBy, "course_track");
      assert.equal(result.result.segments.length, 2);
      assert.equal(result.remainingEvaluations, 29);
      await fill({ segmentBy: "signup_source" });
      assert.equal(
        await page.locator('select[name="prioritySegmentKey"]').inputValue(),
        "",
      );
      await fill({ prioritySegmentKey: "ORGANIC" });
      result = await run();
      assert.equal(result.result.segments.length, 3);
      assert.equal(result.remainingEvaluations, 28);
      await top();
      await shot("segments-source-1536");
      await fill(fixture.responses["b4-segment"]);
      result = await run();
      assert.equal(result.reused, true);
      assert.equal(result.remainingEvaluations, 28);
      await top();
      await shot("segments-course-1536");
      await page.locator(".ba-segment-table").scrollIntoViewIfNeeded();
      await shot("segments-table-1536");
      const b4 = expect(
        await client.call(runPath + "/steps/b4-segment"),
        200,
        "read B4",
      );
      expect(
        await client.call(runPath + "/executions", {
          method: "POST",
          body: {
            operationKey: "ba-segments",
            inputRevision: b4.revision,
            parameters: {},
            expectedSourceRevisions: { "b2-metric": 999, "b3-funnel": 1 },
          },
          headers: idempotency(),
        }),
        409,
        "execution source CAS",
        "EXECUTION_REVISION_STALE",
      );
      await page
        .getByRole("button", { name: "暂停并返回", exact: true })
        .click();
      await page
        .locator(`a[href="/app/review-previews/${fixture.taskVersionId}"]`)
        .click();
      await page
        .getByRole("button", { name: "恢复工程预览", exact: true })
        .click();
      await title("b4-segment");
      await page.getByText(/服务端已复算确认 · 回答/).waitFor();
      await complete("b5-hypothesis");
      assert.equal(
        await page.locator('textarea[name="hypothesis"]').inputValue(),
        "",
      );
      await fill(fixture.responses["b5-hypothesis"]);
      await complete("b6-action");
      assert.equal(
        await page.locator('textarea[name="actionDescription"]').inputValue(),
        "",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "完成此步骤", exact: true })
          .isDisabled(),
        true,
      );
      await top();
      await shot("action-empty-1536");
      const action = {
        ...fixture.responses["b6-action"],
        reviewAfterDays: channel === "msedge" ? 42 : 28,
        guardrailMaximum: 0,
        targetChangePercentagePoints: 0.5,
      };
      await fill(action);
      await saved();
      await page
        .getByRole("button", { name: "我已查看并确认当前依据", exact: true })
        .click();
      await fill({ targetChangePercentagePoints: 100 });
      await page
        .getByRole("button", { name: "完成此步骤", exact: true })
        .click();
      await page
        .getByText(/基线加上学生期望提升不得超过100/)
        .first()
        .waitFor();
      await fill({ targetChangePercentagePoints: 0.5 });
      await saved();
      // A separate authenticated client edits/re-completes B4/B5 while this UI
      // keeps the old B6 snapshot. The revision change must survive completed flags.
      const oldAction = expect(
        await client.call(runPath + "/steps/b6-action"),
        200,
        "old B6 context",
      );
      await fill({ actionDescription: "未同步" });
      const previous = expect(
        await client.call(runPath + "/steps/b4-segment"),
        200,
        "B4 before remote edit",
      );
      expect(
        await client.call(runPath + "/steps/b4-segment/response", {
          method: "PUT",
          body: {
            expectedRevision: previous.revision,
            responseSchemaVersion: fixture.responseSchemaVersion,
            response: {
              ...previous.response,
              priorityReason:
                previous.response.priorityReason + " 另一页面补充核查。",
            },
          },
        }),
        200,
        "remote B4 revision",
      );
      const latest = expect(
        await client.call(runPath + "/steps/b4-segment"),
        200,
        "remote B4 updated",
      );
      const vector = Object.fromEntries(
        latest.inputBindings.map((item) => [
          item.sourceStepKey,
          item.sourceRevision,
        ]),
      );
      expect(
        await client.call(runPath + "/executions", {
          method: "POST",
          body: {
            operationKey: "ba-segments",
            inputRevision: latest.revision,
            parameters: {},
            expectedSourceRevisions: vector,
          },
          headers: idempotency(),
        }),
        200,
        "remote B4 rebind",
      );
      expect(
        await client.call(runPath + "/steps/b4-segment/complete", {
          method: "POST",
          body: { expectedRevision: latest.revision },
          headers: idempotency(),
        }),
        200,
        "remote B4 complete",
      );
      const b5 = expect(
        await client.call(runPath + "/steps/b5-hypothesis"),
        200,
        "B5 retained",
      );
      expect(
        await client.call(runPath + "/steps/b5-hypothesis/complete", {
          method: "POST",
          body: { expectedRevision: b5.revision },
          headers: idempotency(),
        }),
        200,
        "remote B5 complete",
      );
      expect(
        await client.call(runPath + "/steps/b6-action/complete", {
          method: "POST",
          body: {
            expectedRevision: oldAction.revision,
            expectedSourceRevisions: oldAction.baActionContext.sourceRevisions,
          },
          headers: idempotency(),
        }),
        409,
        "B6 stale completed ancestors",
        "STEP_SOURCE_REVISION_CONFLICT",
      );
      await page
        .getByText(/行动依据已过期：上游版本已改变/)
        .waitFor({ timeout: 18000 });
      assert.equal(
        await page
          .getByRole("button", { name: "完成此步骤", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByRole("button", { name: "重新读取当前依据", exact: true })
        .click();
      await page
        .getByRole("button", { name: "我已查看并确认当前依据", exact: true })
        .waitFor();
      assert.equal(
        await page.locator('textarea[name="actionDescription"]').inputValue(),
        "未同步",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "完成此步骤", exact: true })
          .isDisabled(),
        true,
      );
      await page
        .getByRole("button", { name: "我已查看并确认当前依据", exact: true })
        .click();
      await fill({ actionDescription: action.actionDescription });
      await saved();
      await top();
      await shot("action-1536");
      await page
        .locator('select[name="successMetric"]')
        .scrollIntoViewIfNeeded();
      await shot("action-target-1536");
      for (const width of [1366, 1100, 1024, 390]) {
        await page.setViewportSize({
          width,
          height: width < 1024 ? 844 : 1024,
        });
        if (width < 1024) {
          await page.locator(".workspace-device .preview-warning").waitFor();
          assert.equal(await page.locator(".ba-workspace").count(), 0);
        } else {
          await page.locator(".ba-workspace").waitFor();
          await top();
          if (width < 1200) {
            await page
              .getByRole("button", { name: "需要提示？", exact: true })
              .click();
            await page.locator(".workspace-help-drawer[open]").waitFor();
            await page
              .locator(".workspace-help-drawer")
              .getByRole("button", { name: /关闭/ })
              .click();
          }
        }
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await shot("action-" + width);
      }
      await page.setViewportSize({ width: 1536, height: 1024 });
      await page.locator(".ba-workspace").waitFor();
      await complete("回顾这次体验");
      assert.equal(
        await page.locator(".reflection-fields input:checked").count(),
        0,
      );
      for (const key of ["interestingStepKeys", "difficultySources"])
        for (const value of fixture.reflection.answers[key])
          await page.locator(`input[name="${key}"][value="${value}"]`).check();
      await page
        .locator('input[name="continueSimilarWork"][value="YES"]')
        .check();
      await page.getByRole("button", { name: "跳过追问", exact: true }).click();
      await saved();
      await shot("reflection-1536");
      await page
        .getByRole("button", { name: "提交并完成预览", exact: true })
        .click();
      await title("这次工程预览已完成。");
      await shot("closed-1536");
      await page.goto("http://localhost:15173/app");
      await page.locator(".dashboard-majors").waitFor();
      assert.equal(
        await page
          .locator(".dashboard-major-title>span")
          .filter({ hasText: "未开始" })
          .count(),
        3,
      );
      await page.goto(runUrl);
      await title("这次工程预览已完成。");
      assert.equal(await page.locator(".workspace-footer").count(), 0);
      for (const body of requests) {
        assert.deepEqual(body.parameters, {});
        assert.ok(Object.hasOwn(body, "expectedSourceRevisions"));
        assert.equal("observedResult" in body, false);
      }
      for (const value of await Promise.all(responseChecks))
        if (value instanceof Error) throw value;
      assert.ok(cookies.length > 0);
      assert.ok((await Promise.all(cookies)).every((value) => !value));
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors, []);
      console.log(
        JSON.stringify({
          browser: channel,
          status: "PASS",
          checks: [
            "B1 full public dictionary/72 rows and blank analysis",
            "B2 invalid windows, both denominators, changed equal windows, first config quota and request replay vs compute reuse",
            "B3 six stages, exact adjacent table, both stable sorts without preselection, source bindings",
            "B4 both dimensions/clear priority/real groups, source CAS, pause/restore",
            "B6 selected context confirmation, 100% upper limit, fractional PP, zero guardrail, 28/42 review, completed-ancestor source conflict and preserved unsynced plan",
            "independent Reflection, preview close does not count formal completion",
            "1536/1366/1100/1024/390 geometry/drawer/device restriction",
            "no executor cookie/private projection leak/paid model call",
          ],
          screenshots: output,
          paidProviderCalls: 0,
        }),
      );
    } catch (cause) {
      if (!page.isClosed()) {
        await shot("failure").catch(() => undefined);
        const state = await page
          .evaluate(() => {
            const store = document
              .querySelector("#app")
              ?.__vue_app__?.config.globalProperties.$pinia?._s.get(
                "workspace",
              );
            return {
              heading: document.querySelector(".workspace-title-row h1")
                ?.textContent,
              gates: store
                ? {
                    readOnly: store.readOnly,
                    selectionReady: store.selectionReady,
                    busy: store.busy,
                    executing: store.executing,
                    saving: store.saving,
                    dirty: store.dirty,
                    conflict: store.conflict,
                    recovered: !!store.recovered,
                    runStatus: store.run?.status,
                    step: store.step?.stepKey,
                    stepRevision: store.step?.revision,
                    baContextStale: store.baContextStale,
                    baContextConfirmed: store.baContextConfirmed,
                  }
                : null,
              notices: [
                ...document.querySelectorAll(".error-notice,.warning-notice"),
              ].map((node) => node.textContent),
            };
          })
          .catch(() => ({ unavailable: true }));
        await writeFile(
          `${output}/${channel}-failure-state.json`,
          JSON.stringify({ state, errors, consoleErrors }, null, 2),
        );
        console.error(
          JSON.stringify({ browser: channel, state, errors, consoleErrors }),
        );
      }
      throw cause;
    } finally {
      clearTimeout(deadline);
      await browser.close();
    }
  }
} finally {
  await scope.cleanup();
  console.log("P5 browser fixtures and mail removed by exact scoped cleanup");
}
