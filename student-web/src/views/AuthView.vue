<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  api,
  ApiError,
  errorText,
  safeReturn,
  stableOperation,
} from "../lib/api";
import { useAuth } from "../stores/auth";
import { hasTaskDrafts } from "../lib/task-drafts";
import { useIntake } from "../stores/intake";
import type { Consent } from "../types";
import ArrowIcon from "../components/ArrowIcon.vue";
import { pilotMode } from "../lib/pilot";
const route = useRoute(),
  router = useRouter(),
  auth = useAuth(),
  intake = useIntake(),
  operation = stableOperation();
const mode = computed(() =>
  route.path === "/register"
    ? "register"
    : route.path === "/forgot-password"
      ? "forgot"
      : "login",
);
const email = ref(""),
  password = ref(""),
  confirm = ref(""),
  terms = ref(false),
  privacy = ref(false),
  research = ref(false),
  busy = ref(false),
  error = ref(""),
  success = ref(""),
  recovery = ref(false),
  ready = ref(false),
  visible = ref(false);
const title = computed(() =>
  mode.value === "register"
    ? "把这次探索，留给未来的你。"
    : mode.value === "forgot"
      ? "找回你的探索记录。"
      : "继续你的专业探索。",
);
async function prepare() {
  error.value = "";
  success.value = route.query.notice === 'password-changed' ? '密码已修改，所有设备已退出。请使用新密码登录。' : route.query.notice === 'email-changed' ? '邮箱已确认变更，所有设备已退出。请使用新邮箱登录。' : "";
  password.value = "";
  confirm.value = "";
  recovery.value = false;
  ready.value = mode.value !== "register";
  if (mode.value === "register") {
    try {
      await intake.init(true);
      ready.value = true;
    } catch (cause) {
      error.value = errorText(cause);
      recovery.value = true;
    }
  }
}
watch(mode, prepare);
onMounted(prepare);
async function submit() {
  error.value = "";
  success.value = "";
  recovery.value = false;
  if (mode.value === "register") {
    if ([...password.value].length < 15 || [...password.value].length > 128) {
      error.value = "密码需要15–128个字符，可以使用一段容易记住的短句。";
      return;
    }
    if (password.value !== confirm.value) {
      error.value = "两次输入的密码不一致。";
      return;
    }
    if (!terms.value || !privacy.value) {
      error.value = "请阅读并同意使用条款和隐私政策。";
      return;
    }
  }
  if (
    mode.value === "login" &&
    intake.hasUnsaved &&
    !window.confirm("登录后将清除本机未同步的匿名草稿。确定继续吗？")
  )
    return;
  if (mode.value === "login" && await hasTaskDrafts().catch(() => false) &&
      !window.confirm("这台设备上有未同步的任务草稿。登录原账户可以恢复；登录另一个账户将清除原账户的本机草稿。确定继续吗？")) return;
  busy.value = true;
  try {
    if (mode.value === "login") {
      await auth.login(email.value, password.value);
      intake.claimed();
      password.value = "";
      await router.replace(safeReturn(route.query.returnTo));
    } else if (mode.value === "forgot") {
      await api("/api/public/v1/auth/password/forgot", {
        method: "POST",
        body: { email: email.value },
      });
      success.value =
        "如果该邮箱可以恢复账户，你会收到一封邮件。请检查收件箱与垃圾邮件。";
    } else {
      if (intake.view?.status !== "SUBMITTED" || intake.hasUnsaved || intake.pendingFinish) await intake.finish();
      const consents: Consent[] = [
        { documentType: "TERMS", documentVersion: "v1", decision: "ACCEPTED" },
        {
          documentType: "PRIVACY",
          documentVersion: "v1",
          decision: "ACCEPTED",
        },
        {
          documentType: "RESEARCH",
          documentVersion: "v1",
          decision: research.value ? "ACCEPTED" : "DECLINED",
        },
      ];
      const body = {
        intakeSessionId: intake.view?.intakeSessionId,
        email: email.value,
        password: password.value,
        consents,
      };
      const result = await api<{ emailDeliveryStatus: string }>(
        "/api/public/v1/auth/register",
        { method: "POST", body, key: operation(body) },
      );
      intake.claimed();
      password.value = "";
      confirm.value = "";
      await router.push({
        path: "/verify-email",
        state: { registered: true, delivery: result.emailDeliveryStatus },
      });
    }
  } catch (cause) {
    error.value = errorText(cause);
    if (
      cause instanceof ApiError &&
      [
        "INTAKE_ALREADY_CLAIMED",
        "AUTH_REQUIRED",
        "EMAIL_ALREADY_REGISTERED",
      ].includes(cause.code)
    ) {
      recovery.value = true;
      error.value =
        cause.code === "EMAIL_ALREADY_REGISTERED"
          ? "这个邮箱已注册，请登录继续。"
          : "资料可能已经保存并认领，请登录恢复；不要重新提交问卷。";
    }
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <main class="auth-layout">
    <aside class="auth-aside">
      <RouterLink to="/" class="page-back">← 返回首页</RouterLink>
      <h1 class="serif">{{ title }}</h1>
      <p>一个起点，不是一个定论。<br />你始终可以选择不同的方向。</p>
      <div class="auth-mark serif" aria-hidden="true">
        AI <span>/</span> DS <span>/</span> BA
      </div>
      <p class="small">
        我们不会用适配分数、人格标签<br />或录取概率替你作决定。
      </p>
    </aside>
    <section class="auth-form">
      <h2>
        {{
          mode === "register"
            ? "创建账户"
            : mode === "forgot"
              ? "重置密码邮件"
              : "欢迎回来"
        }}
      </h2>
      <p class="muted">
        {{
          mode === "register"
            ? "背景问卷可以稍后补充。注册会保存已填写的资料，验证邮箱后即可自主选择开放的专业。"
            : mode === "forgot"
              ? "输入你注册时使用的邮箱。"
              : pilotMode ? "使用负责人提供的测试账户和密码登录。无需邮箱验证；忘记密码请联系负责人。" : "使用邮箱和密码登录，继续已保存的进度。"
        }}
      </p>
      <form @submit.prevent="submit">
        <label for="auth-email">{{pilotMode?'测试账户':'邮箱'}}</label
        ><input
          id="auth-email"
          v-model.trim="email"
          type="email"
          autocomplete="email"
          required
          maxlength="254"
          :placeholder="pilotMode?'输入负责人提供的账户':'you@example.com'"
        /><template v-if="mode !== 'forgot'"
          ><div class="label-row">
            <label for="auth-password">密码</label
            ><button
              type="button"
              class="plain-button"
              @click="visible = !visible"
            >
              {{ visible ? "隐藏" : "显示" }}密码
            </button>
          </div>
          <input
            id="auth-password"
            v-model="password"
            :type="visible ? 'text' : 'password'"
            :autocomplete="
              mode === 'register' ? 'new-password' : 'current-password'
            "
            required
            maxlength="256"
            :aria-describedby="
              mode === 'register' ? 'password-help' : undefined
            "
          />
          <p v-if="mode === 'register'" id="password-help" class="field-help">
            15–128个字符；不要求混合字符类型，密码不会自动去除空格。
          </p></template
        ><template v-if="mode === 'register'"
          ><label for="confirm-password">确认密码</label
          ><input
            id="confirm-password"
            v-model="confirm"
            :type="visible ? 'text' : 'password'"
            autocomplete="new-password"
            required
            maxlength="256"
          />
          <div class="consent-list">
            <label
              ><input v-model="terms" type="checkbox" required /><span
                >我已阅读并同意<RouterLink to="/terms" target="_blank"
                  >《使用条款》</RouterLink
                >（v1）</span
              ></label
            ><label
              ><input v-model="privacy" type="checkbox" required /><span
                >我已阅读并同意<RouterLink to="/privacy" target="_blank"
                  >《隐私政策》</RouterLink
                >（v1）</span
              ></label
            ><label
              ><input v-model="research" type="checkbox" /><span
                >可选：同意将去标识化的体验资料用于产品研究。可在账户设置撤回，不影响核心服务。</span
              ></label
            >
          </div></template
        >
        <p v-if="error" class="error-notice" role="alert">{{ error }}</p>
        <p v-if="success" class="success-notice" role="status">{{ success }}</p>
        <RouterLink v-if="recovery" to="/login" class="text-link"
          >资料已保存？登录继续</RouterLink
        ><button
          class="primary-button"
          type="submit"
          :disabled="busy || !ready"
        >
          <span>{{
            busy
              ? "正在处理…"
              : mode === "register"
                ? "注册并保存资料"
                : mode === "forgot"
                  ? "发送重置邮件"
                  : "登录"
          }}</span
          ><span class="action-arrow"><ArrowIcon /></span>
        </button>
      </form>
      <div v-if="!pilotMode" class="auth-links">
        <RouterLink v-if="mode === 'login'" to="/forgot-password"
          >忘记密码？</RouterLink
        ><RouterLink v-if="mode === 'login'" to="/intake/1"
          >还没有账户？先找到第一站</RouterLink
        ><RouterLink v-else to="/login">已有账户？登录</RouterLink>
      </div>
    </section>
  </main>
</template>
