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
    new URL("../../contracts/examples/p4-ds-run.json", import.meta.url),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await readFile(
    new URL("../../content/ds-learning/1.0.0/manifest.json", import.meta.url),
    "utf8",
  ),
);
const output = "/tmp/majorpilot-p4-evidence";
await mkdir(output, { recursive: true });
const scope = createFixtureScope("p4-browser"),
  channels = process.argv.includes("--chrome-only")
    ? ["chrome"]
    : ["chrome", "msedge"];
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
        channel + ": 8-minute deadline, closing before exact fixture cleanup",
      );
      void browser.close();
    }, 480000);
    const errors = [],
      consoleErrors = [],
      requests = [],
      responseChecks = [],
      cookies = [],
      checks = [];
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
          request.allHeaders().then((value) => Boolean(value.cookie)),
        );
      if (request.method() === "POST" && url.pathname.endsWith("/executions"))
        requests.push(request.postDataJSON());
    });
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (
        response.status() === 200 &&
        /\/experience-runs\/.+(?:\/task$|\/steps\/[^/]+$|\/executions$)/.test(
          path,
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
    const title = async (step) =>
      page
        .getByRole("heading", {
          name:
            manifest.steps.find((value) => value.stepKey === step)?.title ||
            step,
          exact: true,
        })
        .waitFor();
    const shot = async (name) =>
      page.screenshot({ path: output + "/" + channel + "-" + name + ".png" });
    const saved = async () =>
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
      }));
      assert.ok(Math.abs(geometry.header) < 1);
      assert.ok(geometry.footer <= geometry.height + 1);
      assert.equal(geometry.overflow, false);
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
        if (key === "findings") {
          for (const [i, item] of value.entries())
            for (const [field, entry] of Object.entries(item)) {
              const node = page.locator(
                '[name="finding-' + i + "-" + field + '"]',
              );
              if (field === "statement") await node.fill(entry);
              else await node.selectOption(entry);
            }
          continue;
        }
        const node = page.locator('[name="' + key + '"]');
        if (typeof value === "boolean") {
          if (value) await node.check();
          else await node.uncheck();
        } else if (Array.isArray(value)) {
          for (const entry of value)
            await page
              .locator('input[name="' + key + '"][value="' + entry + '"]')
              .check();
        } else if ((await node.first().getAttribute("type")) === "radio")
          await page
            .locator('input[name="' + key + '"][value="' + value + '"]')
            .check();
        else if (
          (await node.first().evaluate((node) => node.tagName)) === "SELECT"
        )
          await node.selectOption(value);
        else await node.fill(value);
      }
    };
    const run = async () => {
      const pending = page.waitForResponse(
        (value) =>
          value.url().endsWith("/executions") &&
          value.request().method() === "POST",
      );
      await page
        .locator(".ds-run-actions")
        .getByRole("button", { name: /^运行/ })
        .click();
      const response = await pending,
        body = await response.json();
      assert.equal(response.status(), 200, body.error?.code);
      assert.equal(body.data.trustLevel, "SERVER_VERIFIED");
      assert.equal(body.data.result.schemaVersion, "ds-result-v1");
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
        .locator('a[href="/app/review-previews/' + fixture.taskVersionId + '"]')
        .click();
      await title(manifest.title);
      await shot("introduction-1536");
      assert.equal(await page.getByText(/每种操作最多30种成功配置/).count(), 1);
      await page.getByRole("button", { name: "开始工程预览" }).click();
      await title("d1-context");
      runUrl = page.url();
      runPath = "/api/app/v1/experience-runs/" + runUrl.split("/").at(-1);
      await page.getByText("查看数据字典（13个字段）", { exact: true }).click();
      assert.equal(
        await page
          .locator(".ds-references details")
          .first()
          .locator("tbody tr")
          .count(),
        13,
      );
      await fill(fixture.responses["d1-context"]);
      await complete("d2-quality");
      assert.equal(
        await page.locator('textarea[name="duplicateReason"]').inputValue(),
        "",
      );
      assert.equal(await page.locator(".ds-chart").count(), 0);
      await fill(fixture.responses["d2-quality"]);
      await saved();
      await top();
      await shot("quality-empty-1536");
      // A failed isolated launcher preserves answers and permits a fresh Worker.
      await page.route("http://127.0.0.1:15175/", (route) => route.abort());
      await page
        .getByRole("button", { name: "运行质量检查", exact: true })
        .click();
      await page
        .getByText(
          "计算器超时或暂不可用。输入和上次结果仍保留，重试会新建隔离 Worker。",
          { exact: true },
        )
        .waitFor({ timeout: 22000 });
      await page.unroute("http://127.0.0.1:15175/");
      assert.equal(
        await page.locator('textarea[name="duplicateReason"]').inputValue(),
        fixture.responses["d2-quality"].duplicateReason,
      );
      let result = await run();
      assert.equal(result.remainingEvaluations, 29);
      assert.equal(result.result.retainedRows, 359);
      const first = result;
      result = await run();
      // Identical input/source/retry key replays its first receipt, including
      // reused=false. That is distinct from a new revision reusing computation.
      assert.equal(result.reused, first.reused);
      assert.equal(result.remainingEvaluations, 29);
      assert.equal(result.executionId, first.executionId);
      assert.deepEqual(result.result, first.result);
      await page
        .locator('textarea[name="duplicateReason"]')
        .fill(
          fixture.responses["d2-quality"].duplicateReason +
            " 我保留同一处理参数，并补充说明理由。",
        );
      await saved();
      result = await run();
      assert.equal(result.reused, true);
      assert.equal(result.remainingEvaluations, 29);
      assert.equal(result.executionId, first.executionId);
      assert.deepEqual(result.result, first.result);
      assert.ok(result.appliedToRevision > first.appliedToRevision);
      await top();
      await shot("quality-result-1536");
      await complete("d3-profile");
      await fill(fixture.responses["d3-profile"]);
      result = await run();
      assert.equal(
        result.result.profile.histogram.reduce(
          (sum, row) => sum + row.count,
          0,
        ),
        result.result.profile.validCount,
      );
      await page.locator(".ds-chart").scrollIntoViewIfNeeded();
      await shot("histogram-1536");
      await complete("d4-relationship");
      await fill(fixture.groupAlternative);
      result = await run();
      assert.equal(
        result.result.relationship.relationshipMode,
        "GROUP_COMPLETION",
      );
      assert.ok(
        result.result.relationship.groups.every(
          (group) =>
            group.completionRate === null ||
            (group.ciLower <= group.completionRate &&
              group.ciUpper >= group.completionRate),
        ),
      );
      await page.locator(".ds-chart").scrollIntoViewIfNeeded();
      await shot("group-1536");
      await page
        .locator('input[name="relationshipMode"][value="SCATTER"]')
        .check();
      assert.equal(await page.locator('select[name="groupBy"]').count(), 0);
      assert.equal(
        await page.locator('select[name="xField"]').inputValue(),
        "",
      );
      await fill(fixture.responses["d4-relationship"]);
      result = await run();
      assert.equal(
        result.result.relationship.points.length,
        result.result.relationship.scatter.n,
      );
      assert.equal(
        await page.locator(".ds-scatter-point").count(),
        result.result.relationship.scatter.n,
      );
      const scatter = result.result.relationship;
      await page.locator(".ds-chart").scrollIntoViewIfNeeded();
      await shot("scatter-1536");
      await top();
      await shot("relationship-1536");
      for (const width of [1366, 1100, 1024, 390]) {
        await page.setViewportSize({
          width,
          height: width < 1024 ? 844 : 1024,
        });
        if (width < 1024) {
          await page.locator(".workspace-device .preview-warning").waitFor();
          assert.equal(await page.locator(".ds-workspace").count(), 0);
        } else {
          await page.locator(".ds-workspace").waitFor();
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
        await shot("relationship-" + width);
      }
      await page.setViewportSize({ width: 1536, height: 1024 });
      await page.locator(".ds-workspace").waitFor();
      // Exact entry CAS rejection, not a stale chart silently accepted.
      const current = expect(
        await client.call(runPath + "/steps/d4-relationship"),
        200,
        "read D4",
      );
      expect(
        await client.call(runPath + "/executions", {
          method: "POST",
          body: {
            operationKey: "ds-relationship",
            inputRevision: current.revision,
            parameters: {},
            expectedSourceRevisions: { "d2-quality": 999 },
          },
          headers: idempotency(),
        }),
        409,
        "stale source CAS",
        "EXECUTION_REVISION_STALE",
      );
      expect(
        await client.call(runPath + "/steps/d4-relationship/response", {
          method: "PUT",
          body: {
            expectedRevision: Math.max(0, current.revision - 1),
            responseSchemaVersion: fixture.responseSchemaVersion,
            response: fixture.responses["d4-relationship"],
          },
        }),
        409,
        "stale saved response",
      );
      await page
        .getByRole("button", { name: "暂停并返回", exact: true })
        .click();
      await page
        .locator('a[href="/app/review-previews/' + fixture.taskVersionId + '"]')
        .click();
      await page
        .getByRole("button", { name: "恢复工程预览", exact: true })
        .click();
      await title("d4-relationship");
      assert.equal(
        await page.locator('select[name="xField"]').inputValue(),
        "days_to_first_lesson",
      );
      assert.equal(await page.locator(".result-stale").count(), 0);
      // Completed quality decisions remain editable; dependency results become stale.
      await selectStep("d2-quality");
      await page
        .locator('select[name="missingPolicy"]')
        .selectOption("MEDIAN_NUMERIC");
      await saved();
      result = await run();
      assert.equal(result.result.retainedRows, 359);
      assert.equal(result.remainingEvaluations, 28);
      await complete("d3-profile");
      await page.locator(".result-stale").waitFor();
      await run();
      await complete("d4-relationship");
      await page.locator(".result-stale").waitFor();
      if (channel === "msedge") await fill(fixture.groupAlternative);
      result = await run();
      const dsResponse = expect(
        await client.call(runPath + "/steps/d4-relationship"),
        200,
        "saved active branch",
      );
      if (channel === "msedge") {
        assert.equal("xField" in dsResponse.response, false);
        assert.equal("yField" in dsResponse.response, false);
      } else {
        assert.equal("groupBy" in dsResponse.response, false);
        assert.ok(result.result.relationship.scatter.n >= scatter.scatter.n);
      }
      await complete("d5-stratify");
      await fill(fixture.responses["d5-stratify"]);
      result = await run();
      assert.equal(result.result.stratified.strata.length, 2);
      if (channel === "msedge")
        assert.ok(
          result.result.stratified.strata.every(
            (value) => value.summary.groups.length,
          ),
        );
      else {
        assert.equal(
          await page.locator(".ds-stratified-scatter tbody tr").count(),
          3,
        );
        assert.ok(
          result.result.stratified.strata.every(
            (value) => !value.summary.points,
          ),
        );
      }
      await top();
      await shot("uncertainty-1536");
      const detail = page
        .locator(channel === "msedge" ? ".ds-chart" : ".ds-stratified-scatter")
        .first();
      await detail.scrollIntoViewIfNeeded();
      await shot("uncertainty-result-1536");
      await complete("d6-conclusion");
      assert.equal(
        await page.locator('textarea[name="finding-0-statement"]').inputValue(),
        "",
      );
      await fill(fixture.responses["d6-conclusion"]);
      await complete("回顾这次体验");
      assert.equal(
        await page.locator(".reflection-fields input:checked").count(),
        0,
      );
      for (const key of ["interestingStepKeys", "difficultySources"])
        for (const value of fixture.reflection.answers[key])
          await page
            .locator('input[name="' + key + '"][value="' + value + '"]')
            .check();
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
      for (const request of requests) {
        assert.deepEqual(request.parameters, {});
        assert.ok(Object.hasOwn(request, "expectedSourceRevisions"));
        assert.equal("observedResult" in request, false);
      }
      for (const value of await Promise.all(responseChecks))
        if (value instanceof Error) throw value;
      assert.ok(cookies.length > 0);
      assert.ok((await Promise.all(cookies)).every((value) => !value));
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors, []);
      checks.push(
        "D1 dictionary/raw data, blank explanations, independent reflection",
        "D2 Worker failure/recovery, first config consumes1/30, identical-key receipt replay and new-revision compute reuse are distinct/free",
        "D3 fixed bins/n/zero/null and table fallback",
        "D4 group/Wilson and scatter branches, inactive field removal, source CAS and response revision rejection",
        "D2 edit invalidates D3/D4; current binding restored after pause and refresh",
        "D5 both stratification paths, D6 structured conclusion, preview closure excluded from formal completion",
        "1536/1366/1100/1024/390 native geometry, drawer and mobile restriction",
        "private projection boundary, no executor cookie, no paid model call",
      );
      console.log(
        JSON.stringify({
          browser: channel,
          status: "PASS",
          checks,
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
                  }
                : null,
              notices: [
                ...document.querySelectorAll(".error-notice,.workspace-notice"),
              ].map((node) => node.textContent),
            };
          })
          .catch(() => ({ unavailable: true }));
        await writeFile(
          output + "/" + channel + "-failure-state.json",
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
  console.log("P4 browser fixtures and mail removed by exact scoped cleanup");
}
