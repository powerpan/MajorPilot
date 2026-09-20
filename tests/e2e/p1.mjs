import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { mysqlCommand } from "../../scripts/infra.mjs";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../contracts/examples/p1-intake.json", import.meta.url),
    "utf8",
  ),
);
const output = "/tmp/majorpilot-p1-evidence";
await mkdir(output, { recursive: true });
const channels = process.argv.includes("--chrome-only")
  ? ["chrome"]
  : ["chrome", "msedge"];
for (const channel of channels) {
  const run = randomBytes(8).toString("hex"),
    email = `p1-ui-${run}@example.invalid`,
    password = `Synthetic-${randomBytes(18).toString("hex")}`,
    newPassword = `Changed-${randomBytes(18).toString("hex")}`;
  const intakes = new Set(),
    mailIds = new Set(),
    errors = [],
    consoleErrors = [],
    checks = [];
  const browser = await chromium.launch({
    channel,
    headless: true,
    chromiumSandbox: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
  });
  const page = await context.newPage();
  let recoveryTab;
  let allowNetworkErrors = false;
  function watch(p) {
    p.on("pageerror", (error) => errors.push(error.message));
    p.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      const url = message.location().url;
      if (
        message.text().startsWith("Failed to load resource") &&
        (url.includes("/api/") || allowNetworkErrors)
      )
        return;
      consoleErrors.push(message.text());
    });
    p.on("request", (request) =>
      assert.ok(
        !request.url().includes("token="),
        "Mail token leaked to request URL",
      ),
    );
    p.on("response", async (response) => {
      if (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/public/v1/intake-sessions" &&
        response.ok()
      ) {
        const body = await response.json().catch(() => null);
        if (body?.data?.intakeSessionId) intakes.add(body.data.intakeSessionId);
      }
    });
  }
  watch(page);
  async function shot(name, p = page, fullPage = true) {
    await p.screenshot({
      path: `${output}/${channel}-${name}.png`,
      fullPage,
    });
  }
  async function tokenFor(route) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const list = await (
        await fetch("http://127.0.0.1:18025/api/v1/messages")
      ).json();
      for (const item of list.messages || []) {
        if (!(item.To || []).some((to) => to.Address === email)) continue;
        mailIds.add(item.ID);
        const detail = await (
          await fetch(`http://127.0.0.1:18025/api/v1/message/${item.ID}`)
        ).json();
        const token = detail.Text?.match(
          new RegExp(`/${route}#token=([A-Za-z0-9_-]{43})`),
        )?.[1];
        if (token) return token;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Synthetic mail not captured; payload suppressed");
  }
  async function login(pw = password) {
    await page.goto("http://localhost:15173/login");
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page.getByLabel("密码", { exact: true }).fill(pw);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL("**/app");
  }
  try {
    if (!process.argv.includes("--without-home")) {
      await page.goto("http://localhost:15173/");
      await page
        .getByRole("heading", {
          name: /别只看专业介绍。.*先试试，.*你会做什么。/,
        })
        .waitFor();
      assert.match(await page.title(), /MajorPilot/);
      assert.equal(await page.locator("vite-error-overlay").count(), 0);
      await page.locator(".hero-art img").evaluate((img) => {
        if (!img.complete || !img.naturalWidth)
          throw new Error("Hero asset unavailable");
      });
      await shot("home-desktop", page, false);
      await page
        .locator(".explore-section")
        .evaluate((el) =>
          window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY),
        );
      await shot("explore-desktop", page, false);
      await page.getByRole("tab", { name: /DS/ }).click();
      assert.ok(
        await page
          .getByRole("tabpanel")
          .getByRole("heading", { name: "数据里，哪些证据值得相信？" })
          .isVisible(),
      );
      await page.getByRole("tab", { name: /BA/ }).click();
      assert.ok(
        await page
          .getByRole("tabpanel")
          .getByRole("heading", { name: "哪个行动值得先验证？" })
          .isVisible(),
      );
      await shot("explore-ba");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("http://localhost:15173/");
      await shot("home-mobile");
      await shot("home-mobile-fold", page, false);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.getByLabel("打开导航", { exact: true }).click();
      await page
        .getByRole("navigation", { name: "手机导航" })
        .getByRole("link", { name: "如何体验", exact: true })
        .click();
      await page.getByRole("heading", { name: /先实际体验/ }).waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.setViewportSize({ width: 1536, height: 1024 });
      for (const [path, title] of [
        ["/privacy", "隐私政策"],
        ["/terms", "使用条款"],
        ["/how-it-works", /先实际体验/],
      ]) {
        await page.goto(`http://localhost:15173${path}`);
        await page.getByRole("heading", { name: title }).first().waitFor();
      }
      await page.goto("http://localhost:15173/majors/DATA_SCIENCE");
      assert.equal(
        await page
          .getByRole("tab", { name: /DS/ })
          .getAttribute("aria-selected"),
        "true",
      );
      await page.getByRole("tab", { name: /DS/ }).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page
          .getByRole("tab", { name: /BA/ })
          .getAttribute("aria-selected"),
        "true",
      );
      checks.push("accepted home, real three-tab preview and mobile layout");
    }
    await page.goto("http://localhost:15173/intake/1");
    await page.getByText("你目前处于什么阶段？", { exact: true }).waitFor();
    await page.getByRole("button", { name: "保存并继续", exact: true }).click();
    assert.ok(
      await page.getByText("请选择一项。", { exact: true }).isVisible(),
    );
    for (let n = 1; n <= 12; n++) {
      await page.waitForURL(`**/intake/${n}`);
      const data = fixture.answers;
      const selectors = {
        1: ["applicationStage"],
        2: ["targetIntakeWindow"],
        3: ["targetRegions"],
        4: ["currentField"],
        5: ["currentFieldText"],
        6: ["consideredMajors"],
        7: ["majorFamiliarity"],
        8: ["foundationSelfView"],
        9: ["scenarioPreference"],
        10: ["workElements"],
        11: ["decisionUncertainties"],
        12: ["mainQuestion", "acquisitionChannel"],
      }[n];
      if (n === 5) {
        const other = await context.newPage();
        watch(other);
        await other.goto("http://localhost:15173/intake/5");
        await other.locator("#currentFieldText").waitFor();
        await context.setOffline(true);
        allowNetworkErrors = true;
        await page.locator("#currentFieldText").fill("仅本地合成草稿");
        assert.ok(
          await page
            .getByText("当前离线，答案保留在本机。连接恢复后保存。", {
              exact: true,
            })
            .isVisible(),
        );
        await context.setOffline(false);
        await page.waitForFunction(() =>
          document
            .querySelector(".save-state")
            ?.textContent?.includes("已自动保存"),
        );
        await other
          .locator("#currentFieldText")
          .fill("第二标签页冲突的合成草稿");
        await other
          .getByText("检测到另一页面的较新版本", { exact: true })
          .waitFor();
        await other
          .getByRole("button", { name: "放弃本机未同步更改，加载服务器版本" })
          .click();
        await other.waitForFunction(
          () => !document.body.textContent.includes("检测到另一页面的较新版本"),
        );
        assert.equal(
          await other.locator("#currentFieldText").inputValue(),
          "仅本地合成草稿",
        );
        recoveryTab = other;
        allowNetworkErrors = false;
        checks.push(
          "offline draft recovery and real two-tab revision conflict",
        );
      }
      for (const key of selectors) {
        const value = data[key],
          field = page.locator(`[data-field="${key}"]`);
        if (
          typeof value === "string" &&
          ["currentFieldText", "mainQuestion"].includes(key)
        )
          await field.locator("textarea").fill(value);
        else if (typeof value === "string")
          await field.locator(`input[value="${value}"]`).check();
        else if (key === "scenarioPreference") {
          // Start from all tied, then make AI the strict first preference.
          await field.getByRole("button", { name: "三种情境同样想试" }).click();
          await field.locator("#rank-DATA_SCIENCE").selectOption("2");
          await field.locator("#rank-BUSINESS_ANALYTICS").selectOption("3");
          await shot("intake-ranking");
        } else if (Array.isArray(value))
          for (const option of value)
            await field.locator(`input[value="${option}"]`).check();
        else
          for (const [row, option] of Object.entries(value))
            await field.locator(`#${key}-${row}`).selectOption(option);
      }
      if (n === 4) {
        await shot("intake-desktop", page, false);
        await page.setViewportSize({ width: 390, height: 844 });
        await shot("intake-mobile");
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.setViewportSize({ width: 1536, height: 1024 });
      }
      await page
        .getByRole("button", {
          name: n === 12 ? "查看我的初始建议" : "保存并继续",
          exact: true,
        })
        .click();
    }
    await page.waitForURL("**/recommendation");
    await page.locator(".recommendation-title .primary-major-name").waitFor();
    const observation = await page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/public/v1/events" &&
        response.request().method() === "POST",
    );
    assert.equal(
      observation.status(),
      202,
      "Visible recommendation observation must be accepted",
    );
    assert.equal(
      observation.request().postDataJSON().events[0].visibleDurationMs,
      1000,
    );
    assert.equal(
      await page
        .locator(".recommendation-title .primary-major-name")
        .innerText(),
      "Artificial Intelligence",
    );
    assert.ok((await page.locator(".reason-list li").count()) >= 2);
    assert.equal(
      (await context.cookies()).some((c) => c.name === "MP_SESSION"),
      false,
    );
    await shot("recommendation");
    await shot("recommendation-desktop", page, false);
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("recommendation-mobile");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.getByRole("link", { name: "注册并保存建议" }).click();
    await page.waitForURL("**/register");
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByLabel("确认密码", { exact: true }).fill(password);
    const consents = page.locator(".consent-list input");
    assert.equal(await consents.nth(2).isChecked(), false);
    await consents.nth(0).check();
    await consents.nth(1).check();
    await page
      .getByRole("button", { name: "注册并保存建议", exact: true })
      .click();
    await page.waitForURL("**/verify-email");
    if (recoveryTab) {
      await recoveryTab.waitForFunction(
        () => sessionStorage.getItem("mp:intake-draft:v1") === null,
      );
      await recoveryTab.close();
      checks.push("registration claim clears the open second-tab draft");
    }
    assert.equal(
      (await context.cookies()).some(
        (c) => c.name === "MP_SESSION" || c.name === "MP_INTAKE",
      ),
      false,
    );
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("mp:intake-draft:v1")),
      null,
    );
    await login();
    await page.getByRole("heading", { name: "先验证你的邮箱" }).waitFor();
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.waitForURL("**/login");
    const verifyToken = await tokenFor("verify-email");
    await page.goto(`http://localhost:15173/verify-email#token=${verifyToken}`);
    await page
      .getByRole("heading", { name: "邮箱已验证", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(
      (await context.cookies()).some((c) => c.name === "MP_SESSION"),
      false,
    );
    assert.equal(
      await page.evaluate(
        (token) =>
          JSON.stringify({ ...localStorage, ...sessionStorage }).includes(
            token,
          ),
        verifyToken,
      ),
      false,
    );
    await login();
    await page.locator(".dashboard-majors article").first().waitFor();
    assert.equal(await page.locator(".dashboard-majors article").count(), 3);
    await page
      .getByRole("button", { name: "接受这个建议", exact: true })
      .click();
    await page
      .getByRole("button", { name: "确认并保存选择", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "已保存：Artificial Intelligence" })
      .waitFor();
    const ba = page.locator(".dashboard-majors article").filter({
      has: page.getByRole("heading", {
        name: "Business Analytics",
        exact: true,
      }),
    });
    await ba.getByRole("button", { name: "选择这个方向", exact: true }).click();
    assert.equal(
      await page.locator("#override-reason").inputValue(),
      "DECLINED",
    );
    await page
      .getByRole("button", { name: "确认并保存选择", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "已保存：Business Analytics" })
      .waitFor();
    await page.reload();
    await ba.getByRole("button", { name: "已选 · 修改选择" }).waitFor();
    await shot("dashboard");
    await page.getByRole("link", { name: "账户与数据", exact: true }).click();
    await page.getByText("未授权 / 已撤回", { exact: false }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "撤回研究授权", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("link", { name: "← 返回个人主页", exact: true })
      .click();
    const otherAccount = await context.newPage();
    watch(otherAccount);
    await otherAccount.goto("http://localhost:15173/app");
    await otherAccount.locator(".dashboard-majors").waitFor();
    checks.push(
      "12-page real intake, pre-registration AI recommendation despite BA consideration, claim, verify, login and persisted override",
    );
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.waitForURL("**/login");
    await otherAccount.waitForURL("**/login");
    assert.equal(await otherAccount.locator(".dashboard-majors").count(), 0);
    await otherAccount.close();
    checks.push(
      "accept/override remain NOT_STARTED; declined consent and cross-tab logout stay bounded",
    );
    await page.getByRole("link", { name: "忘记密码？" }).click();
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "发送重置邮件", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "如果该邮箱可以恢复账户" })
      .waitFor();
    const resetToken = await tokenFor("reset-password");
    await page.goto(
      `http://localhost:15173/reset-password#token=${resetToken}`,
    );
    await page.getByLabel("新密码", { exact: true }).fill(newPassword);
    await page.getByLabel("确认新密码", { exact: true }).fill(newPassword);
    assert.equal(new URL(page.url()).hash, "");
    await page.getByRole("button", { name: "更新密码", exact: true }).click();
    await page
      .getByRole("heading", { name: "密码已更新", exact: true })
      .waitFor();
    await login(newPassword);
    await page.locator(".dashboard-majors").waitFor();
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.waitForURL("**/login");
    await page.goto(
      "http://localhost:15173/login?returnTo=https://untrusted.invalid",
    );
    await page.getByLabel("邮箱", { exact: true }).fill(email);
    await page.getByLabel("密码", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL("**/app");
    assert.equal(new URL(page.url()).origin, "http://localhost:15173");
    await page.getByRole("button", { name: "退出", exact: true }).click();
    await page.waitForURL("**/login");
    checks.push(
      "SMTP reset link, immediate fragment stripping, password reset, logout and safe return path",
    );
    await page.goto(`http://localhost:15173/verify-email#token=${verifyToken}`);
    await page
      .getByRole("alert")
      .filter({ hasText: "邮件链接无效、已过期或已使用" })
      .waitFor();
    assert.equal(new URL(page.url()).hash, "");
    await page
      .getByRole("button", { name: "重新发送验证邮件", exact: true })
      .waitFor();
    await page.goto(
      `http://localhost:15173/reset-password#token=${resetToken}`,
    );
    await page.getByLabel("新密码", { exact: true }).fill(newPassword);
    await page.getByLabel("确认新密码", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "更新密码", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "邮件链接无效、已过期或已使用" })
      .waitFor();
    assert.equal(await page.getByLabel("新密码", { exact: true }).count(), 0);
    await page
      .getByRole("button", { name: "重新发送重置邮件", exact: true })
      .waitFor();
    checks.push(
      "consumed verification/reset links clear their fragment and expose safe recovery",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    console.log(
      JSON.stringify({
        channel,
        version: browser.version(),
        result: "PASS",
        checks,
        pageErrors: 0,
        unexpectedConsole: 0,
        screenshots: output,
      }),
    );
  } finally {
    await browser.close();
    assert.match(email, /^p1-ui-[a-f0-9]{16}@example\.invalid$/);
    for (const id of intakes) assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    const ids = intakes.size
      ? [...intakes].map((id) => `'${id}'`).join(",")
      : "'no-fixture'";
    const accounts = `SELECT id FROM mp_student_account WHERE email_normalized='${email}'`,
      sessions = `SELECT id FROM mp_intake_session WHERE public_id IN (${ids})`,
      profiles = `SELECT id FROM mp_decision_profile WHERE student_id IN (${accounts}) OR intake_session_id IN (${sessions})`,
      recs = `SELECT id FROM mp_recommendation WHERE decision_profile_id IN (${profiles})`;
    mysqlCommand(
      `USE majorpilot; START TRANSACTION; DELETE FROM mp_product_event WHERE student_id IN (${accounts}) OR intake_session_id IN (${sessions}) OR recommendation_id IN (${recs}); DELETE FROM mp_recommendation_decision WHERE recommendation_id IN (${recs}); DELETE FROM mp_recommendation_reason WHERE recommendation_id IN (${recs}); DELETE FROM mp_recommendation WHERE decision_profile_id IN (${profiles}); DELETE FROM mp_decision_answer WHERE decision_profile_id IN (${profiles}); UPDATE mp_decision_profile SET supersedes_profile_id=NULL WHERE student_id IN (${accounts}) OR intake_session_id IN (${sessions}); DELETE FROM mp_decision_profile WHERE student_id IN (${accounts}) OR intake_session_id IN (${sessions}); DELETE FROM mp_idempotency_record WHERE owner_student_id IN (${accounts}) OR owner_intake_session_id IN (${sessions}); DELETE FROM mp_consent_record WHERE student_id IN (${accounts}) OR intake_session_id IN (${sessions}); DELETE FROM mp_intake_session WHERE public_id IN (${ids}); DELETE FROM mp_email_token WHERE student_id IN (${accounts}); DELETE FROM mp_student_session WHERE student_id IN (${accounts}); DELETE FROM mp_security_event WHERE student_id IN (${accounts}); DELETE FROM mp_student_account WHERE email_normalized='${email}'; COMMIT;`,
    );
    for (const id of mailIds) {
      assert.match(id, /^[A-Za-z0-9_-]+$/);
      const response = await fetch("http://127.0.0.1:18025/api/v1/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ IDs: [id] }),
      });
      assert.ok(response.ok, "Synthetic mail cleanup");
    }
  }
}
