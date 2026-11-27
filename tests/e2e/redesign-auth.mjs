import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { chromium } from "playwright";
import { ROOT, PORTS, JAVA_HOME } from "../../scripts/local-config.mjs";
import { mysqlCommand } from "../../scripts/infra.mjs";

const port = 18161;
const origin = "http://localhost:" + port;
const fixture = "mpdemo" + randomBytes(6).toString("hex");
const password = randomBytes(24).toString("hex");
const firstEmail = "redesign-one@example.invalid";
const secondEmail = "redesign-two@example.invalid";
const providerKey = "re_fixture_only_000000000000000000";
const mail = [];
const fakeResend = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/emails"
      || request.headers.authorization !== "Bearer " + providerKey) {
    response.writeHead(400).end();
    return;
  }
  let body = "";
  for await (const part of request) body += part;
  const message = JSON.parse(body);
  mail.push({ to: message.to, link: message.text.match(/http:\/\/localhost:[^\s]+/)?.[0] });
  response.writeHead(200, { "Content-Type": "application/json" }).end('{"id":"offline-fixture"}');
});
let browser, java, databaseCreated = false, startup = "";
try {
  fakeResend.listen(0, "127.0.0.1");
  await once(fakeResend, "listening");
  mysqlCommand(`CREATE DATABASE \`${fixture}\` CHARACTER SET utf8mb4; CREATE USER '${fixture}'@'127.0.0.1' IDENTIFIED BY '${password}'; GRANT ALL ON \`${fixture}\`.* TO '${fixture}'@'127.0.0.1';`);
  databaseCreated = true;
  const stage = mkdtempSync(join(tmpdir(), "majorpilot-demo-integration-"));
  const original = join(ROOT, "backend/redesign-auth/target/majorpilot-redesign-auth-3.9.2.jar");
  const hash = createHash("sha256").update((await import("node:fs")).readFileSync(original)).digest("hex");
  const jar = join(stage, hash + ".jar");
  cpSync(original, jar);
  java = spawn(join(JAVA_HOME, "bin/java"), ["-jar", jar, "--spring.web.resources.static-locations=file:" + ROOT + "/redesign/"], {
    env: {
      PATH: "/usr/bin:/bin",
      MP_DEMO_PORT: String(port),
      MP_DEMO_ORIGIN: origin,
      MP_DEMO_DB_URL: `jdbc:mysql://127.0.0.1:${PORTS.mysql}/${fixture}?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true`,
      MP_DEMO_DB_USER: fixture,
      MP_DEMO_DB_PASSWORD: password,
      MP_DEMO_RESEND_API_KEY: providerKey,
      MP_DEMO_MAIL_ENDPOINT: `http://127.0.0.1:${fakeResend.address().port}/emails`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [java.stdout, java.stderr]) stream.on("data", (chunk) => { startup += chunk; });
  const deadline = Date.now() + 32000;
  while (true) {
    if (java.exitCode !== null || Date.now() > deadline) throw Error("Demo fixture failed to start: " + startup.replaceAll(password, "[redacted]").replaceAll(providerKey, "[redacted]"));
    const health = await fetch(origin + "/api/demo/health", { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (health?.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const call = (context, path, data, method = "POST", refer = origin) =>
    context.request[method.toLowerCase()](origin + "/api/demo/" + path, { data, headers: { Origin: refer } });

  browser = await chromium.launch({ channel: "chrome", headless: true, chromiumSandbox: true });
  const contexts = await Promise.all([1440, 390, 1024].map((width) => browser.newContext({
    viewport: { width, height: 900 }, reducedMotion: "reduce",
  })));
  const errors = [];
  for (const context of contexts) {
    await context.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ contentType: "text/css", body: "" }));
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  }
  const [a, b, other] = contexts;
  assert.equal((await call(a, "link", { email: firstEmail }, "POST", "https://other.example")).status(), 403);
  assert.equal((await call(a, "link", { email: "invalid" })).status(), 422);
  assert.equal(mail.length, 0);
  assert.equal((await call(a, "progress", {}, "PUT")).status(), 401);
  const pageA = await a.newPage();
  await pageA.goto(origin + "/?preset=sample#/lens/ba/memo");
  const answer = pageA.locator("#ba-memo-rec");
  const originalAnswer = "Local demo work to test cross-device sync.";
  await answer.fill(originalAnswer);
  await pageA.getByRole("button", { name: "Sign in by email", exact: true }).click();
  await pageA.getByLabel("Email", { exact: true }).fill(firstEmail);
  await pageA.getByRole("button", { name: "Send me a sign-in link" }).click();
  await pageA.getByText("Check your inbox for a sign-in link.", { exact: true }).waitFor();
  assert.equal(mail.length, 1);
  assert.equal((await call(a, "link", { email: firstEmail })).status(), 429);
  const first = mail[0].link;
  const token = new URL(first).hash.split("=")[1];
  await pageA.goto(first);
  await pageA.getByRole("button", { name: "Confirm sign-in", exact: true }).waitFor();
  assert.equal(new URL(pageA.url()).hash, "");
  assert.equal((await a.request.get(origin + "/api/demo/session").then(r => r.json())).signedIn, false);
  await pageA.getByRole("button", { name: "Confirm sign-in", exact: true }).click();
  await pageA.locator(".save-state").getByText("Synced to your account", { exact: true }).waitFor();
  assert.equal((await call(a, "sign-in", { token })).status(), 422);
  const sessionA = await a.request.get(origin + "/api/demo/session").then(r => r.json());
  assert.equal(sessionA.email, firstEmail);
  assert.ok(JSON.stringify(sessionA.progress).includes(originalAnswer));
  const cookie = (await a.cookies()).find(c => c.name === "__Host-mp_demo");
  assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax" && cookie.path === "/");

  // Simulate a new minute in the isolated fixture after proving the resend limit above.
  mysqlCommand(`DELETE FROM \`${fixture}\`.demo_mail_limit;`);
  assert.equal((await call(b, "link", { email: firstEmail })).status(), 202);
  const pageB = await b.newPage();
  await pageB.goto(mail[1].link);
  await pageB.getByRole("button", { name: "Confirm sign-in", exact: true }).click();
  await pageB.getByRole("button", { name: "Account", exact: true }).waitFor();
  await pageB.goto(origin + "/#/lens/ba/memo");
  await pageB.waitForFunction(text => document.querySelector("#ba-memo-rec")?.value === text, originalAnswer);

  await pageA.goto(origin + "/#/lens/ba/memo");
  await pageA.waitForFunction(text => document.querySelector("#ba-memo-rec")?.value === text, originalAnswer);
  const remoteAnswer = "This newer answer came from browser A.";
  await pageA.locator("#ba-memo-rec").fill(remoteAnswer);
  await pageA.locator(".save-state").getByText("Synced to your account", { exact: true }).waitFor();
  const localAnswer = "This draft was written separately in browser B.";
  await pageB.locator("#ba-memo-rec").fill(localAnswer);
  await pageB.getByText("Which progress should we keep?").waitFor();
  assert.equal(await pageB.locator("#ba-memo-rec").inputValue(), localAnswer);
  await pageB.getByRole("button", { name: "Use account progress" }).click();
  await pageB.waitForFunction(text => document.querySelector("#ba-memo-rec")?.value === text, remoteAnswer);
  assert.ok(await pageB.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await pageB.getByRole("button", { name: "Account", exact: true }).click();
  await pageB.getByRole("button", { name: "Sign out", exact: true }).click();
  await pageB.getByRole("button", { name: "Sign in by email", exact: true }).waitFor();
  assert.equal((await b.request.get(origin + "/api/demo/session").then(r => r.json())).signedIn, false);

  assert.equal((await call(other, "link", { email: secondEmail, lang: "zh" })).status(), 202);
  const secondToken = new URL(mail[2].link).hash.split("=")[1];
  assert.equal((await call(other, "sign-in", { token: secondToken })).status(), 200);
  const isolated = await other.request.get(origin + "/api/demo/session").then(r => r.json());
  assert.equal(isolated.email, secondEmail);
  assert.equal(isolated.progress, null);
  assert.equal((await call(other, "progress", { accountId: sessionA.id, revision: sessionA.revision, progress: sessionA.progress }, "PUT")).status(), 401);
  assert.equal((await call(other, "progress", { accountId: isolated.id, revision: 0, progress: { ...sessionA.progress, constructor: {} } }, "PUT")).status(), 422);
  assert.deepEqual(errors, []);
  console.log("PASS: isolated MySQL, simulated provider, two Chrome contexts, one-use login, scope checks, conflict, logout.");
} finally {
  if (browser) await browser.close();
  if (java && java.exitCode === null) { java.kill(); await once(java, "exit"); }
  fakeResend.close();
  if (databaseCreated) mysqlCommand(`DROP DATABASE \`${fixture}\`; DROP USER '${fixture}'@'127.0.0.1';`);
}
