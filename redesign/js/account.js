/* Email sign-in and account-scoped progress for the standalone demo. */
(function () {
  "use strict";
  const MP = window.MP;
  const t = (en, zh) => MP.t({ en, zh });
  let member = null;
  let linkToken = null;
  let timer;
  let signInRunning = false;
  const draftKey = (id) => "mp-redesign-draft-v1:" + id;

  async function api(path, method = "GET", payload) {
    const response = await fetch("/api/demo" + path, {
      method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(12000),
      ...(payload === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    });
    const body = response.status === 204 ? null : await response.json();
    return { status: response.status, body };
  }

  function draft(id) {
    try {
      const value = JSON.parse(localStorage.getItem(draftKey(id)));
      return value?.progress?.v === 1 && Number.isSafeInteger(value.revision) ? value : null;
    } catch { return null; }
  }

  function retain(account) {
    try {
      if (account.pending) {
        localStorage.setItem(draftKey(account.id), JSON.stringify({
          progress: JSON.parse(account.pending), revision: account.revision, choose: !!account.conflict,
        }));
      } else localStorage.removeItem(draftKey(account.id));
      account.retained = true;
    } catch { account.retained = false; }
  }

  function status() {
    if (member?.conflict) return t("Choose which progress to keep", "请选择要保留的进度");
    if (member?.failed) return member.retained
      ? t("Saved here · sync pending", "已保存在当前浏览器，待同步")
      : t("Progress not saved", "进度尚未保存");
    if (member?.pending) return t("Syncing progress…", "正在同步进度…");
    return t("Synced to your account", "已同步到账户");
  }

  function paint() {
    if (!member) return;
    document.querySelectorAll(".save-state .txt, .dsh-save.is-saved .s").forEach((node) => {
      node.textContent = status();
    });
  }

  function setConflict(account, latest) {
    account.conflict = latest;
    retain(account);
    paint();
    showConflict();
  }

  function queue() {
    const account = member;
    if (!account) return;
    const state = JSON.stringify(MP.state);
    const unchanged = !account.sending && !account.conflict && account.synced === state;
    const pending = unchanged ? null : state;
    if (pending === account.pending) return;
    account.pending = pending;
    account.failed = false;
    retain(account);
    paint();
    clearTimeout(timer);
    if (!account.conflict && account.pending) timer = setTimeout(flush, 450);
  }

  async function flush() {
    const account = member;
    if (!account || account.conflict || !account.pending || account.sending) return account?.sending;
    clearTimeout(timer);
    const progress = account.pending;
    const job = (async () => {
      try {
        const response = await api("/progress", "PUT", {
          accountId: account.id, revision: account.revision, progress: JSON.parse(progress),
        });
        if (account !== member) return;
        if (response.status === 409) {
          setConflict(account, response.body);
        } else if (response.status === 401) {
          detach();
          MP.toast(t("Sign in again to sync your saved draft.", "请重新登录，同步保留的草稿。"));
        } else if (response.status === 200) {
          account.revision = response.body.revision;
          account.synced = progress;
          if (account.pending === progress) account.pending = null;
          account.failed = false;
          retain(account);
        } else account.failed = true;
      } catch { if (account === member) account.failed = true; }
    })();
    account.sending = job;
    await job;
    account.sending = null;
    if (account !== member) return;
    paint();
    if (account.pending && !account.failed && !account.conflict) timer = setTimeout(flush, 0);
  }

  function nonempty(progress) {
    return !!(progress.qs?.fields?.length || progress.qs?.ask || progress.qs?.text || progress.qs?.said
      || progress.profile?.stage || progress.profile?.background || progress.profile?.regions?.length
      || Object.values(progress.lenses || {}).some((lens) => lens?.startedAt || Object.keys(lens?.data || {}).length)
      || progress.brief?.notes?.length);
  }

  function attach(data, importGuest) {
    clearTimeout(timer);
    const device = importGuest && !member && nonempty(MP.state) ? MP.state : null;
    const cached = draft(data.id);
    const personal = cached?.progress || device;
    const account = { id: data.id, email: data.email, revision: cached?.revision ?? data.revision,
      pending: null, synced: null, sending: null, conflict: null, retained: true, failed: false };
    member = account;
    if (data.progress) {
      MP.deviceProgress.replace(data.progress);
      account.synced = JSON.stringify(MP.state);
    }
    if (personal) {
      MP.deviceProgress.replace(personal);
      if (data.progress && account.synced === JSON.stringify(MP.state)) {
        account.revision = data.revision;
        retain(account);
      } else if (data.progress && (!cached || cached.choose || cached.revision !== data.revision)) {
        account.pending = JSON.stringify(MP.state);
        setConflict(account, data);
      } else queue();
    } else if (!data.progress) {
      const lang = MP.lang();
      MP.deviceProgress.replace({ lang });
      account.synced = JSON.stringify(MP.state);
    }
    MP.render();
    if (!account.conflict && account.pending) void flush();
  }

  function detach() {
    clearTimeout(timer);
    member = null;
    MP.closeModal();
    MP.deviceProgress.replace(MP.deviceProgress.load());
    MP.render();
  }

  function showConflict() {
    MP.modal(`<div class="stack"><div class="h2">${t("Which progress should we keep?", "要保留哪一份进度？")}</div>
      <p>${t("This browser and your account have different work. Choose the version you want to continue.",
        "当前浏览器和账户有两份不同的进度，请选择从哪一份继续。")}</p>
      <div class="modal-actions">${MP.h.quiet(t("Decide later", "稍后决定"), "modal-close")}
      ${MP.h.secondary(t("Use account progress", "使用账户进度"), "account-remote")}
      ${MP.h.primary(t("Keep this browser’s progress", "保留当前浏览器进度"), "account-local", "", { sm: true })}</div></div>`);
  }

  function choose(useLocal) {
    const account = member;
    if (!account?.conflict) return;
    const latest = account.conflict;
    const local = MP.state;
    account.conflict = null;
    account.revision = latest.revision;
    account.failed = false;
    account.pending = null;
    MP.deviceProgress.replace(latest.progress || { lang: MP.lang() });
    account.synced = JSON.stringify(MP.state);
    if (useLocal) {
      MP.deviceProgress.replace(local);
      queue();
      void flush();
    }
    retain(account);
    MP.closeModal();
    MP.render();
  }

  function loginModal() {
    if (member?.conflict) return showConflict();
    if (member) {
      MP.modal(`<div class="stack"><div class="h2">${t("Your account", "你的账户")}</div>
        <p class="muted" id="signed-in-email"></p><p role="status">${status()}</p>
        <div class="modal-actions">${MP.h.quiet(t("Close", "关闭"), "modal-close")}
        ${member.pending ? MP.h.secondary(t("Retry sync", "重试同步"), "account-retry") : ""}
        ${MP.h.secondary(t("Sign out", "退出登录"), "account-out")}</div></div>`);
      document.getElementById("signed-in-email").textContent = member.email;
      return;
    }
    MP.modal(`<form id="demo-email-form" class="stack"><div class="h2">${MP.ui("saveProgress")}</div>
      <p class="muted">${t("We’ll send you a sign-in link. Signing in lets you save your progress and continue on another device.",
        "我们会发一封带登录链接的邮件。登录后可同步进度，换设备接着体验。")}</p>
      <div class="field"><label for="acc-email">${t("Email", "邮箱")}</label><input class="input" id="acc-email" type="email" autocomplete="email" maxlength="254" required></div>
      <p id="demo-email-status" role="status" hidden></p>
      <div class="modal-actions"><button class="btn-quiet" type="button" data-action="modal-close">${t("Not now", "暂不")}</button>
      <button class="btn-primary sm" type="submit"><span>${t("Send me a sign-in link", "发送登录链接")}</span></button></div></form>`);
    document.getElementById("demo-email-form").addEventListener("submit", sendLink);
  }

  async function sendLink(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    const message = form.querySelector("#demo-email-status");
    submit.disabled = true;
    message.hidden = false;
    message.textContent = t("Sending…", "正在发送…");
    try {
      const { status: code } = await api("/link", "POST", { email: form.querySelector("input").value, lang: MP.lang() });
      message.textContent = code === 202
        ? t("Check your inbox for a sign-in link.", "请到收件箱查看登录邮件。")
        : code === 429 ? t("Please wait before requesting another link.", "请稍后再申请新的登录链接。")
          : code === 422 ? t("Check your email address and try again.", "请检查邮箱地址后重试。")
            : t("We couldn’t send a link right now. Please try again.", "暂时无法发送，请稍后重试。");
    } catch { message.textContent = t("We couldn’t send a link right now. Please try again.", "暂时无法发送，请稍后重试。"); }
    finally { submit.disabled = false; }
  }

  function prepareLink() {
    const match = location.hash.match(/^#sign-in=([A-Za-z0-9_-]{43})$/);
    if (!match) return false;
    linkToken = match[1];
    history.replaceState(null, "", location.pathname + location.search);
    return true;
  }

  async function boot() {
    if (linkToken) {
      MP.modal(`<div class="stack"><div class="h2">${t("Sign in to MajorPilot", "登录 MajorPilot")}</div>
        <p>${t("Confirm to continue with the email address that received this link.", "确认后，将使用收到链接的邮箱登录。")}</p>
        <p id="demo-link-status" role="status" hidden></p>
        <div class="modal-actions">${MP.h.quiet(t("Cancel", "取消"), "account-cancel-link")}
        ${MP.h.primary(t("Confirm sign-in", "确认登录"), "account-confirm", "", { sm: true })}</div></div>`);
      return false;
    }
    try {
      const response = await api("/session");
      if (response.status === 200 && response.body.id && !member && !signInRunning) attach(response.body, false);
    } catch { /* Local guest mode also works from a static preview. */ }
    return !!member;
  }

  MP.on("account", loginModal);
  MP.on("account-cancel-link", () => { linkToken = null; MP.closeModal(); void boot(); });
  MP.on("account-remote", () => choose(false));
  MP.on("account-local", () => choose(true));
  MP.on("account-retry", async () => { MP.closeModal(); await flush(); });
  MP.on("account-confirm", async (button) => {
    if (!linkToken || signInRunning) return;
    signInRunning = true;
    button.disabled = true;
    const message = document.getElementById("demo-link-status");
    message.hidden = false;
    message.textContent = t("Signing in…", "正在登录…");
    try {
      const response = await api("/sign-in", "POST", { token: linkToken });
      if (response.status !== 200) {
        message.textContent = t("This link can’t sign you in. Close this message and request a new link.",
          "这个链接无法登录。关闭后，请重新申请一个登录链接。");
        return;
      }
      linkToken = null;
      MP.closeModal();
      attach(response.body, true);
      MP.go("#/dashboard");
    } catch { message.textContent = t("Sign-in is unavailable right now. Try again.", "暂时无法登录，请重试。"); }
    finally { signInRunning = false; button.disabled = false; }
  });
  MP.on("account-out", async (button) => {
    button.disabled = true;
    try {
      const signingOut = member;
      await flush();
      if (member === signingOut && member.pending && !member.retained) {
        MP.toast(t("Sync your progress before signing out to keep your changes.", "请先同步进度，避免退出后丢失修改。"));
        return;
      }
      const response = await api("/sign-out", "POST");
      if (response.status !== 204) throw new Error();
      detach();
      MP.go("#/home");
    } catch { MP.toast(t("Couldn’t sign out. Please try again.", "暂时无法退出，请重试。")); }
    finally { button.disabled = false; }
  });
  window.addEventListener("online", () => void flush());
  window.addEventListener("hashchange", () => { if (prepareLink()) void boot(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });

  MP.cloud = { get email() { return member?.email; }, prepareLink, boot, queue, status };
})();
