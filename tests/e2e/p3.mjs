import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createFixtureScope } from "../../scripts/lib/local-student-fixture.mjs";
const fixture = JSON.parse(
  await readFile(
    new URL("../../contracts/examples/p3-ai-run.json", import.meta.url),
    "utf8",
  ),
);
const output = "/tmp/majorpilot-p3-evidence";
await mkdir(output, { recursive: true });
const scope = createFixtureScope("p3-browser");
const channels = process.argv.includes("--chrome-only")
  ? ["chrome"]
  : ["chrome", "msedge"];
try {
  const accounts = [await scope.student(), await scope.student()];
  for (const [index, channel] of channels.entries()) {
    const browser = await chromium.launch({
      channel,
      headless: true,
      chromiumSandbox: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1536, height: 1024 },
      }),
      page = await context.newPage();
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(30000);
    const deadline = setTimeout(
      () => {
        console.error(
          `${channel}: 8-minute browser deadline reached; closing browser, then exact fixture cleanup`,
        );
        void browser.close();
      },
      8 * 60 * 1000,
    );
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
            .then((value) => {
              const text = JSON.stringify(value);
              assert.doesNotMatch(
                text,
                /evaluation-private|training-private|review-private|golden-private|"goldLabel"/,
                "student projections must not leak private assets/labels",
              );
            })
            .catch((error) => error),
        );
    });
    const title = async (text) =>
      page
        .getByRole("heading", { name: text, exact: true })
        .waitFor({ timeout: 20000 });
    const shot = async (name) =>
      page.screenshot({ path: `${output}/${channel}-${name}.png` });
    const top = async () => {
      await page.locator(".workspace-main-body").hover();
      const remaining = await page
        .locator(".workspace-main-body")
        .evaluate((element) => element.scrollTop);
      if (remaining > 0) await page.mouse.wheel(0, -Math.ceil(remaining));
      await page.waitForFunction(
        () => document.querySelector(".workspace-main-body")?.scrollTop === 0,
        undefined,
        { timeout: 5000 },
      );
      await page.locator(".workspace-title-row h1").click();
      await page.waitForFunction(
        () =>
          Math.abs(
            document.querySelector(".workspace-header").getBoundingClientRect()
              .top,
          ) < 1,
        undefined,
        { timeout: 5000 },
      );
      const geometry = await page.evaluate(() => ({
        headerTop: document
          .querySelector(".workspace-header")
          .getBoundingClientRect().top,
        footerBottom: document
          .querySelector(".workspace-footer")
          .getBoundingClientRect().bottom,
        height: innerHeight,
      }));
      assert.ok(
        Math.abs(geometry.headerTop) < 1,
        "header must start at the native viewport top",
      );
      assert.ok(
        geometry.footerBottom <= geometry.height + 1,
        "primary footer must be visible inside the viewport",
      );
    };
    const saved = async () =>
      page.waitForFunction(
        () =>
          document.querySelector('[data-testid="save-status"]')?.textContent ===
          "已保存",
        undefined,
        { timeout: 12000 },
      );
    const complete = async (next) => {
      await page
        .getByRole("button", { name: "完成此步骤", exact: true })
        .click();
      await title(next);
    };
    const runEvaluation = async () => {
      const response = page.waitForResponse(
        (value) =>
          value.url().endsWith("/executions") &&
          value.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: /^(运行正式评估|复用或重新评估)$/ })
        .click();
      const result = await response;
      return { status: result.status(), body: await result.json() };
    };
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
      await page.getByRole("link", { name: "了解并进入 →" }).click();
      await title("AI：让支持请求分类更可靠");
      await shot("introduction-1536");
      await page.getByRole("button", { name: "开始工程预览" }).click();
      await title("认识支持请求分类任务");
      assert.equal(
        await page.locator(".classifier-label-reference dt").count(),
        4,
      );
      const runUrl = page.url();
      await page.locator('input[name="acknowledged"]').check();
      await page
        .locator('select[name="taskGoal"]')
        .selectOption(fixture.responses["a1-task"].taskGoal);
      await complete("理解覆盖率与错误代价");
      await page
        .locator('select[name="priorityMetric"]')
        .selectOption("AUTO_ACCURACY");
      await page
        .locator('textarea[name="errorCostReason"]')
        .fill(fixture.responses["a2-metrics"].errorCostReason);
      await complete("检查公开练习中的错误");
      assert.equal(
        await page.locator('input[name="inspectedSampleIds"]').count(),
        24,
      );
      for (const id of fixture.responses["a3-errors"].inspectedSampleIds)
        await page
          .locator(`input[name="inspectedSampleIds"][value="${id}"]`)
          .check();
      for (const [i, pattern] of fixture.responses[
        "a3-errors"
      ].errorPatterns.entries()) {
        await page
          .locator(`select[name="pattern-${i}"]`)
          .selectOption(pattern.patternCode);
        for (const id of pattern.sampleIds)
          await page
            .locator(`input[name="pattern-sample-${i}"][value="${id}"]`)
            .check();
        await page
          .locator(`textarea[name="explanation-${i}"]`)
          .fill(pattern.explanation);
      }
      await complete("设计有限配置修改");
      assert.equal(
        await page.locator('textarea[name="modificationReason"]').inputValue(),
        "",
        "no student rationale is fabricated",
      );
      assert.equal(
        await page.locator(".classifier-practice .classifier-metrics").count(),
        0,
      );
      await page
        .locator('textarea[name="modificationReason"]')
        .fill(fixture.responses["a4-configure"].modificationReason);
      await page
        .locator('textarea[name="expectedEffect"]')
        .fill(fixture.responses["a4-configure"].expectedEffect);
      await saved();
      await shot("configure-interaction-1536");
      await top();
      await shot("configure-1536");
      console.log(
        `${channel}: A1–A4 real controls/save reached; responsive matrix begins`,
      );
      for (const width of [1366, 1100, 1024, 390]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1024,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${width}: no horizontal overflow`,
        );
        if (width < 1024) {
          await page.locator(".workspace-device .preview-warning").waitFor();
          assert.equal(await page.locator(".classifier-config").count(), 0);
          assert.equal(
            (
              await page
                .locator(".workspace-device .preview-warning")
                .textContent()
            ).trim(),
            "工程预览；尚待专业审核与真实用户计时",
          );
        } else {
          await page.locator(".classifier-config").waitFor();
          await top();
        }
        await shot(`configure-${width}`);
      }
      await page.setViewportSize({ width: 1536, height: 1024 });
      await page
        .getByRole("button", { name: "练习集预览", exact: true })
        .click();
      await page.locator(".classifier-practice .classifier-metrics").waitFor();
      assert.equal(
        requests.length,
        0,
        "practice must not call formal execution",
      );
      await page
        .locator('input[name="confidenceThreshold"][value="0.55"]')
        .focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page
          .locator('input[name="confidenceThreshold"][value="0.7"]')
          .isChecked(),
        true,
      );
      await page
        .getByText("练习预览已过期：当前配置已修改，请重新预览。")
        .waitFor();
      await page
        .locator('input[name="confidenceThreshold"][value="0.55"]')
        .check();
      await saved();
      await page
        .getByRole("button", { name: "暂停并返回", exact: true })
        .click();
      await page.getByRole("link", { name: "了解并进入 →" }).click();
      await page.getByRole("button", { name: "恢复工程预览" }).click();
      await title("设计有限配置修改");
      assert.equal(
        await page.locator('textarea[name="modificationReason"]').inputValue(),
        fixture.responses["a4-configure"].modificationReason,
      );
      await page.getByRole("button", { name: "保存并进入评估" }).click();
      await title("在固定评价集上比较结果");
      await top();
      await shot("evaluate-empty-1536");
      assert.equal(
        (await page.getByTestId("metric-coverage").textContent()).trim(),
        "—",
        "no fabricated pre-evaluation candidate",
      );
      let result = await runEvaluation();
      assert.equal(result.status, 200);
      assert.equal(result.body.data.remainingEvaluations, 5);
      assert.equal(result.body.data.result.candidate.sampleCount, 48);
      assert.equal(
        result.body.data.result.candidate.correctAutoRoutedCount,
        27,
      );
      for (const [key, value] of Object.entries(
        fixture.responses["a5-evaluate"],
      ))
        await page.locator(`textarea[name="${key}"]`).fill(value);
      await saved();
      await page.locator(".result-stale").waitFor();
      result = await runEvaluation();
      assert.equal(result.status, 200);
      assert.equal(result.body.data.reused, true);
      assert.equal(result.body.data.remainingEvaluations, 5);
      await page.locator(".result-stale").waitFor({ state: "hidden" });
      assert.equal(await page.locator(".result-stale").count(), 0);
      await page.reload();
      await title("在固定评价集上比较结果");
      assert.equal(
        await page.locator(".result-stale").count(),
        0,
        "applied source survives reload",
      );
      checks.push(
        "real A1-A5 answers,24 public cases,isolated practice/no formal call,native controls,pause/resume,baseline-free and source binding",
      );
      const variants = [
        [0.4, "MANUAL_REVIEW"],
        [0.7, "MANUAL_REVIEW"],
        [0.4, "AUTO_ROUTE"],
        [0.55, "AUTO_ROUTE"],
        [0.7, "AUTO_ROUTE"],
      ];
      for (const [i, [threshold, policy]] of variants.entries()) {
        await page
          .getByRole("button", { name: "返回修改", exact: true })
          .click();
        await title("设计有限配置修改");
        await page
          .locator(`input[name="confidenceThreshold"][value="${threshold}"]`)
          .check();
        await page
          .locator(`input[name="lowConfidencePolicy"][value="${policy}"]`)
          .check();
        await page.getByRole("button", { name: "保存并进入评估" }).click();
        await title("在固定评价集上比较结果");
        const runId = new URL(runUrl).pathname.split("/").at(-1);
        const boundResponse = await page.request.get(
          `http://localhost:15173/api/app/v1/experience-runs/${runId}/steps/a5-evaluate`,
        );
        assert.equal(boundResponse.status(), 200);
        const bound = (await boundResponse.json()).data;
        const allowedBindings = bound.inputBindings.filter((value) =>
          ["confidenceThreshold", "lowConfidencePolicy"].includes(
            value.parameterKey,
          ),
        );
        assert.equal(
          allowedBindings.find(
            (value) => value.parameterKey === "confidenceThreshold",
          )?.value,
          threshold,
          "A5 must bind the chosen saved A4 threshold",
        );
        assert.equal(
          allowedBindings.find(
            (value) => value.parameterKey === "lowConfidencePolicy",
          )?.value,
          policy,
          "A5 must bind the chosen saved A4 policy",
        );
        result = await runEvaluation();
        console.log(
          JSON.stringify({
            browser: channel,
            phase: "configuration-quota",
            iteration: i + 1,
            requested: {
              confidenceThreshold: threshold,
              lowConfidencePolicy: policy,
            },
            a5Revision: bound.revision,
            bindings: allowedBindings.map(
              ({ parameterKey, sourceStepKey, sourceRevision, value }) => ({
                parameterKey,
                sourceStepKey,
                sourceRevision,
                value,
              }),
            ),
            execution: {
              status: result.status,
              reused: result.body.data?.reused,
              sourceRevisions: result.body.data?.sourceRevisions,
              appliedSourceRevisions: result.body.data?.appliedSourceRevisions,
              remainingEvaluations: result.body.data?.remainingEvaluations,
            },
          }),
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.data.remainingEvaluations, 4 - i);
        assert.equal(result.body.data.reused, false);
        assert.deepEqual(
          result.body.data.appliedSourceRevisions,
          Object.fromEntries(
            bound.inputBindings.map((binding) => [
              binding.sourceStepKey,
              binding.sourceRevision,
            ]),
          ),
          "evaluation must apply the exact saved source bound above",
        );
        if (i === 1) {
          const expectedCoverage = `${(result.body.data.result.candidate.coverage * 100).toFixed(1)}%`;
          await page.reload();
          await title("在固定评价集上比较结果");
          await page.getByTestId("metric-coverage").waitFor();
          assert.equal(
            (await page.getByTestId("metric-coverage").textContent()).trim(),
            expectedCoverage,
            "second non-baseline configuration survives refresh",
          );
          assert.equal(
            await page.locator(".result-stale").count(),
            0,
            "second non-baseline configuration remains currently bound",
          );
        }
      }
      await top();
      await shot("evaluate-result-1536");
      const finalCoverage = result.body.data.result.candidate.coverage;
      await page.reload();
      await title("在固定评价集上比较结果");
      await page.getByTestId("metric-coverage").waitFor();
      assert.equal(
        (await page.getByTestId("metric-coverage").textContent()).trim(),
        `${(finalCoverage * 100).toFixed(1)}%`,
        "refresh restores current bound result, not old baseline",
      );
      assert.equal(
        await page.locator(".result-stale").count(),
        0,
        "current applied source binding survives refresh after multiple configurations",
      );
      await page
        .getByText("查看混淆矩阵与各类 precision / recall", { exact: true })
        .click();
      assert.equal(await page.locator(".classifier-matrix").count(), 2);
      await page.locator(".classifier-matrix").first().scrollIntoViewIfNeeded();
      await shot("evaluate-matrix-1536");
      await page.getByRole("button", { name: "返回修改", exact: true }).click();
      await title("设计有限配置修改");
      await page
        .locator('select[name="definition-technical_issue"]')
        .selectOption("technical-clarified");
      await page.getByRole("button", { name: "保存并进入评估" }).click();
      await title("在固定评价集上比较结果");
      result = await runEvaluation();
      assert.equal(result.status, 429);
      assert.equal(result.body.error.code, "EVALUATION_LIMIT_REACHED");
      await shot("quota-exhausted");
      await page.getByRole("button", { name: "返回修改", exact: true }).click();
      await title("设计有限配置修改");
      await page
        .locator('select[name="definition-technical_issue"]')
        .selectOption("technical-default");
      await page.getByRole("button", { name: "保存并进入评估" }).click();
      await title("在固定评价集上比较结果");
      result = await runEvaluation();
      assert.equal(result.status, 200);
      assert.equal(result.body.data.reused, true);
      assert.equal(result.body.data.remainingEvaluations, 0);
      await complete("决定使用方式与边界");
      checks.push(
        "five distinct successful configs,quota rejection,free reused result after quota,original/applied source revisions,aggregates/matrix/precision/recall only",
      );
      await page
        .locator('select[name="rolloutDecision"]')
        .selectOption(fixture.responses["a6-decision"].rolloutDecision);
      for (const key of ["decisionReason", "residualRisk"])
        await page
          .locator(`textarea[name="${key}"]`)
          .fill(fixture.responses["a6-decision"][key]);
      await page
        .locator('textarea[name="monitoringItems"]')
        .fill(fixture.responses["a6-decision"].monitoringItems.join("\n"));
      await complete("回顾这次体验");
      assert.equal(
        await page.locator(".reflection-fields input:checked").count(),
        0,
        "reflection starts unselected",
      );
      await page
        .locator('input[name="interestingStepKeys"][value="a4-configure"]')
        .check();
      await page
        .locator('input[name="difficultySources"][value="KNOWLEDGE"]')
        .check();
      await page
        .locator('input[name="continueSimilarWork"][value="YES"]')
        .check();
      await saved();
      const followUp = page.waitForResponse(
        (value) =>
          value.url().endsWith("/reflection/follow-up") &&
          value.request().method() === "POST",
      );
      await page.getByRole("button", { name: "请求可选追问" }).click();
      assert.equal((await followUp).status(), 200);
      await page
        .getByText("追问暂不可用。你可以重试或直接提交已有反思。")
        .waitFor();
      await page.getByRole("button", { name: "跳过追问", exact: true }).click();
      await saved();
      await shot("reflection-1536");
      await page.getByRole("button", { name: "提交并完成预览" }).click();
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
        "preview does not enter formal completion",
      );
      assert.equal(
        await page
          .getByRole("button", { name: "开始正式体验", exact: true })
          .count(),
        0,
        "REVIEW is not published",
      );
      await page.goto(runUrl);
      await title("这次工程预览已完成。");
      assert.equal(await page.locator(".workspace-footer").count(), 0);
      checks.push(
        "A6 decision,optional follow-up disabled fallback,reflection closure/read-only,no formal completion or report/NEXT",
      );
      assert.ok(requests.length >= 8);
      for (const request of requests) {
        assert.equal(request.operationKey, "ai-evaluate");
        assert.deepEqual(request.parameters, {});
        assert.equal("observedResult" in request, false);
      }
      for (const result of await Promise.all(responseChecks))
        if (result instanceof Error) throw result;
      assert.equal((await Promise.all(cookies)).some(Boolean), false);
      assert.ok(cookies.length > 0);
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleErrors, []);
      checks.push(
        "no private labels/paths in projections,no classifier executor Cookie,no console/page errors",
      );
      console.log(
        JSON.stringify({
          browser: channel,
          version: browser.version(),
          checks,
          screenshots: output,
          paidProviderCalls: 0,
        }),
      );
    } catch (cause) {
      // Only state gates and reviewed configuration: no credentials, headers,
      // free-text responses or complete browser storage are captured.
      if (!page.isClosed()) {
        await page.screenshot({ path: `${output}/${channel}-failure.png` })
          .catch(() => undefined);
        const state = await page.evaluate(() => {
          const root = document.querySelector("#app"),
            store = root?.__vue_app__?.config.globalProperties.$pinia?._s.get("workspace");
          return {
            heading: document.querySelector(".workspace-title-row h1")?.textContent?.trim(),
            saveStatus: document.querySelector('[data-testid="save-status"]')?.textContent?.trim(),
            gates: store ? {
              readOnly: store.readOnly,
              selectionReady: store.selectionReady,
              busy: store.busy,
              executing: store.executing,
              saving: store.saving,
              dirty: store.dirty,
              conflict: store.conflict,
              hasRecovered: !!store.recovered,
              runStatus: store.run?.status,
              runRevision: store.run?.revision,
              step: store.step?.stepKey,
              stepRevision: store.step?.revision,
              stepReadOnly: store.step?.readOnly,
            } : null,
            configuration: store ? {
              confidenceThreshold: store.answer?.confidenceThreshold,
              lowConfidencePolicy: store.answer?.lowConfidencePolicy,
              definitionVariantIds: store.answer?.definitionVariantIds,
            } : null,
            notices: [...document.querySelectorAll(".error-notice,.workspace-notice")]
              .map((value) => value.textContent?.trim()),
            geometry: {
              headerTop: document.querySelector(".workspace-header")?.getBoundingClientRect().top,
              footerBottom: document.querySelector(".workspace-footer")?.getBoundingClientRect().bottom,
              viewportHeight: innerHeight,
            },
          };
        }).catch(() => ({ unavailable: true }));
        await writeFile(
          `${output}/${channel}-failure-state.json`,
          JSON.stringify({ browser: channel, state, pageErrors: errors, consoleErrors }, null, 2),
        );
        console.error(JSON.stringify({
          browser: channel, phase: "failure-state", state, pageErrors: errors, consoleErrors,
        }));
      }
      throw cause;
    } finally {
      clearTimeout(deadline);
      await browser.close();
    }
  }
} finally {
  await scope.cleanup();
  console.log(
    "P3 browser fixtures and captured mail removed by exact scoped cleanup",
  );
}
