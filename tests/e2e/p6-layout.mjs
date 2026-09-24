// UI-only concept/print regression using Java-generated, schema-validated goldens.
// ALL /api routes are intercepted. This is not the P6 formal business acceptance.
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  out = "/tmp/majorpilot-p6-layout";
const load = (name) =>
  readFile(`${root}contracts/examples/reports/${name}.json`, "utf8").then(
    JSON.parse,
  );
const bodies = {
  experience: await load("data_science"),
  fallback: await load("data_science-fallback"),
  comparison: await load("comparison-2"),
  comparison3: await load("comparison-3"),
};
const labels = {
  AI: "Artificial Intelligence",
  DATA_SCIENCE: "Data Science",
  BUSINESS_ANALYTICS: "Business Analytics",
};
await mkdir(out, { recursive: true });
const results = [];
for (const channel of ["chrome", "msedge"]) {
  const browser = await chromium.launch({
      channel,
      headless: true,
      chromiumSandbox: true,
    }),
    deadline = setTimeout(() => void browser.close(), 180000);
  try {
    for (const scenario of [
      "experience",
      "fallback",
      "comparison",
      "comparison3",
      "waiting",
    ]) {
      const report = bodies[scenario] || bodies.experience,
        context = await browser.newContext({
          viewport: { width: 1536, height: 1024 },
        }),
        page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [],
        unknown = [],
        events = [],
        feedback = [];
      let feedbackFail = true, reportReturned = false, hydrationHeld = false, releaseHydration;
      const hydrationGate = new Promise(resolve => { releaseHydration = resolve; });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("503"))
          errors.push(message.text());
      });
      const status = {
        reportId: report.reportId,
        status: "READY",
        currentVersionId: report.reportVersionId,
        generation: null,
        revision: 1,
      };
      await page.route("**/api/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        let data;
        if (path === "/api/app/v1/me") {
          if (scenario === "experience" && reportReturned && !hydrationHeld) {
            hydrationHeld = true;
            await hydrationGate;
          }
          data = {
            studentId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            email: "ui-only@example.invalid",
            status: "ACTIVE",
            emailVerified: true,
            canStartExperience: true,
          };
        }
        else if (path.endsWith("/auth/csrf")) data = { csrfToken: "mock-only" };
        else if (path === "/api/app/v1/events") {
          events.push(...request.postDataJSON().events);
          data = { acceptedCount: 1, duplicateCount: 0 };
        } else if (path === "/api/app/v1/feedback") {
          feedback.push(request.postDataJSON());
          if (feedbackFail) {
            feedbackFail = false;
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({
                error: { code: "TEMPORARY_UNAVAILABLE" },
              }),
            });
            return;
          }
          data = {
            feedbackId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
            status: "RECEIVED",
          };
        } else if (path === "/api/app/v1/comparison-report")
          data =
            scenario === "waiting"
              ? {
                  state: "WAITING",
                  reason: "WAITING_SOURCE_REPORTS",
                  majors: [
                    { majorCode: "AI", status: "CLOSED" },
                    { majorCode: "DATA_SCIENCE", status: "CLOSED" },
                  ],
                }
              : { state: "READY", report, generation: null };
        else if (path.startsWith("/api/app/v1/recommendations/"))
          data = {
            recommendationType: "NEXT",
            recommendationId: report.nextRecommendation.recommendationId,
            sourceRunId: report.nextRecommendation.sourceRunId,
            decisionProfileId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
            ruleVersion: "next-recommendation-v1",
            explanationVersion: "next-explanation-v1",
            completedMajorCodes: report.nextRecommendation.completedMajorCodes,
            primaryMajor: report.nextRecommendation.primaryMajor,
            alternativeMajors: report.nextRecommendation.alternativeMajors,
            reasons: [
              {
                code: report.nextRecommendation.reasonCodes[0],
                reasonType: "RANKING",
                text: report.sections.find((section) =>
                  ["NEXT_EXPERIENCE", "REMAINING_MAJOR"].includes(
                    section.sectionKey,
                  ),
                ).claims[0].text,
              },
            ],
            differences: Object.entries(labels).map(([majorCode, name]) => ({
              majorCode,
              name,
              description:
                "使用不同的任务内容观察工作方式，不构成能力或适配排名。",
              availability: "UNAVAILABLE",
            })),
            generatedAt: report.generatedAt,
          };
        else if (path.endsWith("/status")) {
          const id = path.split("/").at(-2),
            source = report.sources.find(
              (item) => item.sourceReport?.reportId === id,
            )?.sourceReport;
          data = source
            ? {
                ...status,
                reportId: id,
                currentVersionId: source.reportVersionId,
              }
            : status;
        } else if (
          path === `/api/app/v1/reports/${report.reportId}` ||
          path === `/api/app/v1/reports/${report.reportId}/print`
        )
          data = report;
        else {
          unknown.push({ method: request.method(), path });
          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "RESOURCE_NOT_FOUND" } }),
          });
          return;
        }
        if (data?.schemaVersion === "report-v1") reportReturned = true;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            data,
            meta: { requestId: "ui-only", apiVersion: "v1" },
          }),
        });
      });
      const path =
        scenario.startsWith("comparison") || scenario === "waiting"
          ? "/app/comparison"
          : `/app/reports/${report.reportId}`;
      await page.goto("http://localhost:15173" + path);
      await page.locator(".report-reader").waitFor();
      await page.waitForFunction(
        () => !document.querySelector(".loading-state"),
      );
      if (scenario === "waiting") {
        await page
          .getByText("体验已完成，正在等待各专业报告准备就绪。", {
            exact: true,
          })
          .waitFor();
        await page.screenshot({ path: `${out}/${channel}-waiting-1536.png` });
        assert.equal(await page.locator(".report-claim").count(), 0);
        assert.ok(
          (await page.locator(".report-document").boundingBox()).width > 600,
          "Waiting content must not occupy the absent chapter sidebar",
        );
        await page.getByRole("button", { name: "刷新状态", exact: true }).click();
        await page
          .getByText("体验已完成，正在等待各专业报告准备就绪。", { exact: true })
          .waitFor();
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          true,
        );
        assert.ok((await page.locator(".report-document").boundingBox()).width > 300);
        await page.screenshot({ path: `${out}/${channel}-waiting-390.png` });
      } else {
        await page.locator(".report-section").first().waitFor();
        if (scenario === "experience") {
          await page.locator("textarea[name=reportComment]").waitFor({ state: "attached" });
          assert.equal(await page.locator("textarea[name=reportComment]").isDisabled(), true, "Slow authenticated draft hydration must fence editing");
          releaseHydration();
          await page.waitForFunction(() => !document.querySelector("textarea[name=reportComment]").disabled);
          assert.equal(hydrationHeld, true);
        }
        await page.waitForTimeout(1100); // Explicit continuous-visible observation gate, not a GET.
        assert.ok(events.some(event => event.eventName === (report.reportType === "COMPARISON" ? "comparison_report.viewed" : "report.viewed")));
        assert.equal(
          await page.locator(".report-section").count(),
          report.sections.length,
        );
        assert.equal(
          await page.locator(".report-document-header h1").innerText(),
          report.reportType === "COMPARISON"
            ? "你的专业体验比较"
            : `${labels[report.majorCode]} 体验报告`,
        );
        if (scenario === "fallback")
          await page
            .getByText(
              "部分个性化解释暂不可用；事实、自述和本次成果仍可查看。",
              { exact: true },
            )
            .waitFor();
        for (const width of [1536, 1366, 768, 390]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 1024,
          });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(120);
          const layout = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth,
            title: getComputedStyle(
              document.querySelector(".report-document h1"),
            ).fontSize,
            body: getComputedStyle(document.querySelector(".report-claim-text"))
              .fontSize,
            controls: [
              ...document.querySelectorAll(
                ".report-header button,.report-form-field select,.report-form-field textarea",
              ),
            ].map((node) => parseFloat(getComputedStyle(node).fontSize)),
          }));
          assert.equal(
            layout.overflow,
            false,
            `${scenario} ${width}: horizontal overflow`,
          );
          assert.ok(parseFloat(layout.body) >= 16);
          assert.ok(layout.controls.every((value) => value >= 16));
          await page.screenshot({
            path: `${out}/${channel}-${scenario}-${width}.png`,
          });
        }
        await page.setViewportSize({ width: 1536, height: 1024 });
        const basis = page.locator(".report-basis summary").first();
        await basis.focus();
        await page.keyboard.press("Space");
        assert.equal(
          await basis.evaluate((node) => node.parentElement.open),
          true,
        );
        if (scenario.startsWith("comparison")) {
          const dimensions = page.locator(".report-dimensions");
          assert.equal(await dimensions.locator("tbody tr").count(), 7);
          assert.equal(
            await dimensions.locator("tbody td").count(),
            7 * report.sources.length,
          );
          await dimensions.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${out}/${channel}-${scenario}-dimensions.png`,
          });
        }
        if (scenario === "experience") {
          const feedbackForm = page.locator(".report-feedback");
          await feedbackForm.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${out}/${channel}-feedback-form-1536.png` });
          assert.equal(
            await feedbackForm.locator("input[type=radio]:checked").count(),
            0,
          );
          assert.equal(
            await feedbackForm.locator("input[type=radio]").count(),
            10,
          );
          assert.equal(
            await feedbackForm.locator("select[name=nextAction]").inputValue(),
            "",
          );
          const text = "仅用于UI失败恢复检查的合成评论，不是真实反馈。";
          await page.locator("textarea[name=reportComment]").fill(text);
          await page
            .getByRole("button", { name: "提交反馈", exact: true })
            .click();
          await page.locator(".report-feedback .error-notice").waitFor();
          assert.equal(
            await page.locator("textarea[name=reportComment]").inputValue(),
            text,
          );
          await page
            .getByRole("button", { name: "提交反馈", exact: true })
            .click();
          await page
            .getByText("反馈已收到，谢谢你。你的选择与报告不会因此改变。", {
              exact: true,
            })
            .waitFor();
          assert.equal(feedback.length, 2);
          assert.deepEqual(feedback[0], feedback[1]);
          await page
            .locator("#section-NEXT_EXPERIENCE")
            .scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${out}/${channel}-next-feedback-1536.png`,
          });
          await page.getByRole("button", { name: "打印", exact: true }).click();
          await page.waitForURL("**/print?expectedVersion=*");
          await page
            .getByRole("button", { name: "打印此版本", exact: true })
            .waitFor();
          await page.waitForFunction(
            () => !document.querySelector(".report-print-button").disabled,
          );
          await page.evaluate(() => { window.print = () => { window.__mockPrintInvoked = true; }; });
          const printed = page.waitForResponse(response => response.url().endsWith('/api/app/v1/events') && response.request().postDataJSON().events.some(event => event.eventName === 'report.printed'));
          await page.getByRole('button', { name: '打印此版本', exact: true }).click(); await printed;
          assert.equal(await page.evaluate(() => window.__mockPrintInvoked), true);
          assert.equal(await page.locator(".report-basis").count(), 0);
          assert.equal(
            await page.locator(".report-basis-copy").count(),
            report.sections.reduce(
              (sum, section) => sum + section.claims.length,
              0,
            ),
          );
          await page.emulateMedia({ media: "print" });
          await page.screenshot({ path: `${out}/${channel}-print-css.png` });
          if (channel === "chrome")
            await page.pdf({
              path: `${out}/experience-print-ui-only.pdf`,
              format: "A4",
              printBackground: true,
            });
        }
      }
      assert.deepEqual(unknown, []);
      assert.deepEqual(errors, []);
      results.push({
        scope: "MOCK UI ONLY; not formal business acceptance",
        channel,
        scenario,
        sections: scenario === "waiting" ? 0 : report.sections.length,
        consoleErrors: errors.length,
        eventCount: events.length,
      });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
console.log(
  "PASS: P6 UI mock layout, report sections, compare dimensions, optional feedback recovery and print CSS. No registrations or real API state.",
);
