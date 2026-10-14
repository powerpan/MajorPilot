<script setup lang="ts">
import { pilotMode } from "../lib/pilot";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { onIdentityChange, useAuth } from "../stores/auth";
import { usePrivacy } from "../stores/privacy";
import PrivacyDialog from "../components/PrivacyDialog.vue";
import ArrowIcon from "../components/ArrowIcon.vue";
import type { ExportScope } from "../types/privacy";
const auth = useAuth(), privacy = usePrivacy(), router = useRouter(), route = useRoute();
const modal = ref<"email" | "password" | "delete" | "withdraw" | null>(null);
const password = ref(""), nextPassword = ref(""), newEmail = ref(""), accepted = ref(false);
const scope = ref<ExportScope | "">(""), notice = ref("");
const title = computed(() => ({ email: "更换登录邮箱", password: "修改密码", delete: "确认删除账户", withdraw: "撤回研究授权" })[modal.value || "email"]);
const exportNames: Record<string,string> = { REQUESTED: "等待处理", PENDING: "等待处理", QUEUED: "等待处理", PROCESSING: "正在整理", READY: "文件已准备好", FAILED: "整理失败", EXPIRED: "文件已过期", REVOKED: "文件已撤销" };
const exportStatus = computed(() => exportNames[privacy.currentExport?.status || ""] || privacy.currentExport?.status);
function time(value: string | null | undefined) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"; }
function clearSecrets() { password.value = ""; nextPassword.value = ""; newEmail.value = ""; accepted.value = false; }
function close() { modal.value = null; clearSecrets(); }
const unlisten = onIdentityChange(() => { close(); scope.value = ""; notice.value = ""; });
function open(value: typeof modal.value) { clearSecrets(); privacy.error = ""; notice.value = ""; modal.value = value; }
async function submit() {
  try {
    if (modal.value === "email") { await privacy.changeEmail(password.value, newEmail.value); notice.value = "变更请求已受理。如果该地址可用于本账户，我们会发送确认邮件；确认前仍使用原邮箱登录。"; }
    else if (modal.value === "password") { await privacy.changePassword(password.value, nextPassword.value); await router.replace("/login?notice=password-changed"); }
    else if (modal.value === "withdraw") { await privacy.withdraw(); notice.value = "研究授权已撤回，不影响核心服务。"; }
    else if (modal.value === "delete" && accepted.value) { const id = await privacy.confirmDeletion(password.value); await router.replace(`/deletion-status/${id}`); }
    close();
  } catch { password.value = ""; nextPassword.value = ""; }
}
async function beginDeletion() { open("delete"); try { await privacy.requestDeletion(); } catch { /* Store exposes safe error. */ } }
async function createExport() {
  if (!scope.value) return;
  try { const result = await privacy.requestExport(scope.value); await router.replace({ query: { exportId: result.exportId } }); } catch { /* Store message. */ }
}
async function refresh() { try { await privacy.refreshExport(); } catch { /* Store message. */ } }
async function download() { try { await privacy.download(); } catch { /* Store message. */ } }
async function chooseExport(id: string) { try { await privacy.refreshExport(id); await router.replace({ query: { exportId: id } }); } catch { /* Store message. */ } }
let timer: ReturnType<typeof setInterval>, disposed = false;
onMounted(async () => {
  try {
    await privacy.load();
    const id = route.query.exportId;
    if (typeof id === "string" && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id)) await privacy.refreshExport(id);
  } catch { /* No invented account state. */ }
  if (disposed) return;
  timer = setInterval(() => {
    if (document.visibilityState === "visible" && !privacy.busy && ["REQUESTED", "PENDING", "QUEUED", "PROCESSING"].includes(privacy.currentExport?.status || "")) void refresh();
  }, 5000);
});
onBeforeUnmount(() => { disposed = true; clearInterval(timer); unlisten(); clearSecrets(); });
</script>
<template>
  <main class="privacy-page">
    <RouterLink to="/app" class="page-back">← 返回个人主页</RouterLink>
    <header class="privacy-title"><p class="eyebrow">YOUR ACCOUNT, YOUR CHOICE</p><h1 class="serif">账户与隐私</h1><p>管理登录方式、研究授权，以及属于你的资料。</p></header>
    <div class="privacy-layout">
      <nav class="privacy-nav" aria-label="账户设置章节"><a href="#account-security">01　账户安全</a><a href="#research-consent">02　研究授权</a><a href="#personal-export">03　导出个人资料</a><a href="#delete-account">04　删除账户</a><RouterLink to="/privacy">隐私说明 ↗</RouterLink></nav>
      <div class="privacy-sections">
        <p v-if="notice" class="success-notice" role="status">{{ notice }}</p><p v-if="privacy.error && !modal" class="error-notice" role="alert">{{ privacy.error }} <button type="button" class="text-link" @click="privacy.load().catch(() => {})">重新读取</button></p>
        <section id="account-security"><div class="privacy-section-heading"><span>01</span><h2>账户安全</h2></div>
          <div class="privacy-row"><div><h3>{{pilotMode?'测试账户':'登录邮箱'}}</h3><p>{{ auth.me?.email || '正在读取账户…' }}</p><small v-if="auth.me">{{pilotMode?'这是测试用登录标识，不是真实邮箱，无需验证。':auth.me.emailVerified ? '已验证' : '尚未验证；不影响使用账户与隐私设置' }}</small></div><button v-if="!pilotMode" class="quiet-button" :disabled="privacy.busy || !auth.me" @click="open('email')">更换邮箱</button></div>
          <div class="privacy-row"><div><h3>密码</h3><p>{{ auth.me ? '已设置' : '正在读取账户…' }}</p><small>修改成功后，所有设备将退出登录。</small></div><button class="quiet-button" :disabled="privacy.busy || !auth.me" @click="open('password')">修改密码</button></div>
        </section>
        <section id="research-consent"><div class="privacy-section-heading"><span>02</span><h2>可选产品研究授权</h2></div><p>研究授权独立于核心服务，拒绝或撤回都不会影响你的体验、报告或必要运行统计。</p>
          <div class="privacy-row"><div><p class="privacy-status">{{ privacy.research ? privacy.research.decision === 'ACCEPTED' ? '已授权' : '未授权 / 已撤回' : privacy.busy ? '正在读取…' : '暂无授权记录' }}</p><small v-if="privacy.research">版本 {{ privacy.research.documentVersion }} · {{ time(privacy.research.decidedAt) }}</small></div><button v-if="privacy.research?.decision === 'ACCEPTED'" class="quiet-button" :disabled="privacy.busy" @click="open('withdraw')">撤回研究授权</button></div>
          <details><summary>查看同意记录</summary><ul class="privacy-records"><li v-for="(row, i) in privacy.consents" :key="i"><span>{{ row.documentType }} · {{ row.documentVersion }} · {{ row.decision }}</span><time>{{ time(row.decidedAt) }}</time></li></ul></details>
        </section>
        <section id="personal-export"><div class="privacy-section-heading"><span>03</span><h2>导出个人资料</h2></div><p>资料会整理成私有 ZIP 文件，内含可阅读的 JSON 与报告 HTML。准备完成后 24 小时内，可在此下载。</p>
          <fieldset class="privacy-scope"><legend>选择导出范围</legend><label><input v-model="scope" type="radio" name="exportScope" value="REPORTS_ONLY" /><span><strong>仅报告</strong><small>已生成的报告版本，含依据与边界说明。</small></span></label><label><input v-model="scope" type="radio" name="exportScope" value="FULL_PERSONAL_EXPORT" /><span><strong>完整个人资料</strong><small>账户、问卷与选择、体验回答与结果、反思、报告与反馈。</small></span></label></fieldset>
          <button class="primary-button privacy-export-button" :disabled="privacy.busy || !scope" @click="createExport"><span>请求导出</span><span class="action-arrow"><ArrowIcon /></span></button>
          <details v-if="privacy.exports.length"><summary>最近的导出请求（最多 20 条）</summary><ul class="privacy-records"><li v-for="item in privacy.exports" :key="item.exportId"><span>{{ item.scope === 'REPORTS_ONLY' ? '仅报告' : '完整个人资料' }} · {{ exportNames[item.status] || item.status }} · {{ time(item.requestedAt) }}</span><button class="text-link" :disabled="privacy.busy" @click="chooseExport(item.exportId)">查看状态</button></li></ul></details>
          <div v-if="privacy.currentExport" class="privacy-export" role="status"><div><strong>{{ exportStatus }}</strong><p>{{ privacy.currentExport.scope === 'REPORTS_ONLY' ? '仅报告' : '完整个人资料' }} · 申请于 {{ time(privacy.currentExport.requestedAt) }}</p><p v-if="privacy.currentExport.expiresAt">有效至 {{ time(privacy.currentExport.expiresAt) }}</p><p v-if="privacy.currentExport.status === 'FAILED'">暂未生成文件，请稍后重新申请。{{ privacy.currentExport.failureCode }}</p></div><button v-if="privacy.currentExport.status === 'READY'" class="quiet-button" :disabled="privacy.busy" @click="download">下载私有文件</button><button class="text-link" :disabled="privacy.busy" @click="refresh">刷新状态</button></div>
        </section>
        <section id="delete-account"><div class="privacy-section-heading"><span>04</span><h2>删除账户</h2></div><p>确认后立即停止账户访问并撤销会话；资料会尽快处理，最迟 30 天内完成。请求受理不等于删除完成。</p><p>本机缓存的草稿也会清除。备份、已发送的邮件及离线设备副本不能承诺即时擦除；具体范围见<RouterLink to="/privacy" class="text-link">隐私说明</RouterLink>。</p><button class="quiet-button privacy-delete" :disabled="privacy.busy" @click="beginDeletion">了解并申请删除</button></section>
      </div>
    </div>
    <PrivacyDialog :open="!!modal" :title="title" :busy="privacy.busy" @close="close">
      <form class="privacy-form" @submit.prevent="submit">
        <template v-if="modal === 'withdraw'"><p>撤回仅影响可选产品研究授权，不影响核心服务或必要产品运行统计。</p></template>
        <template v-else>
          <p v-if="modal === 'email'">确认邮件将发送到新邮箱。确认成功后，所有设备会退出，你需要使用新邮箱重新登录。</p>
          <p v-if="modal === 'password'">新密码须为 15–128 个字符，不强制特定字符类别。密码不会保存在浏览器存储中。</p>
          <template v-if="modal === 'delete'"><p>这是不可撤回的删除确认。确认后账户立即停止访问，后台尽快处理，最迟 30 天内完成。</p><p>此浏览器已预置专用回执凭证。确认响应丢失时仍可查询；仅记住回执编号不能在其他设备恢复访问。</p><label class="privacy-check"><input v-model="accepted" type="checkbox" required />我理解账户和资料将被删除，本机未提交草稿也会清除。</label></template>
          <label>当前密码<input v-model="password" type="password" autocomplete="current-password" required maxlength="256" /></label>
          <label v-if="modal === 'email'">新邮箱<input v-model="newEmail" type="email" autocomplete="email" required maxlength="254" /></label>
          <label v-if="modal === 'password'">新密码<input v-model="nextPassword" type="password" autocomplete="new-password" required minlength="15" maxlength="128" /></label>
        </template>
        <p v-if="privacy.error" class="error-notice" role="alert">{{ privacy.error }}</p>
        <div class="privacy-dialog-actions"><button type="button" class="quiet-button" :disabled="privacy.busy" @click="close">取消</button><button class="primary-button" :disabled="privacy.busy || (modal === 'delete' && (!accepted || !privacy.deletion))">{{ privacy.busy ? '正在处理…' : modal === 'delete' ? '确认删除账户' : modal === 'withdraw' ? '确认撤回' : '提交变更' }}</button></div>
        <RouterLink v-if="modal === 'delete' && privacy.deletion" :to="`/deletion-status/${privacy.deletion.receiptId}`" class="text-link">查看本次请求回执</RouterLink>
      </form>
    </PrivacyDialog>
  </main>
</template>
