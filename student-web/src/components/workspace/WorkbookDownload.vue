<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api, ApiError, errorText } from '../../lib/api';
import { identityRequest, onIdentityChange, useAuth } from '../../stores/auth';

interface Workbook { assetKey: string; filename: string; workbookVersion: string; mediaType: string; byteLength: number; rowCount: number; sha256: string; taskVersionId: string }
const props = defineProps<{ runId: string; taskVersionId: string }>();
const auth = useAuth(), files = ref<Workbook[]>([]), error = ref(''), loading = ref(false), downloading = ref(false), notice = ref('');
let generation = 0;
const base = computed(() => `/api/app/v1/experience-runs/${encodeURIComponent(props.runId)}/workbooks`);
function clear() { generation++; files.value = []; error.value = ''; notice.value = ''; loading.value = false; downloading.value = false; }
const stopIdentity = onIdentityChange(clear);
async function load() {
  clear();
  const issued = generation, ticket = identityRequest();
  loading.value = true;
  try {
    const result = await api<Workbook[]>(base.value, { signal: ticket.signal });
    if (issued !== generation || !ticket.current()) return;
    if (result.some(file => file.taskVersionId !== props.taskVersionId || file.assetKey !== 'materials' || file.byteLength > 5 * 1024 * 1024 || !file.filename.endsWith('.xlsx'))) throw new Error('文件版本暂时无法核对。');
    files.value = result;
  } catch (cause) {
    if (issued !== generation || !ticket.current()) return;
    if (cause instanceof ApiError && cause.status === 401) auth.expire();
    else error.value = errorText(cause);
  } finally { ticket.finish(); if (issued === generation) loading.value = false; }
}
async function download(file: Workbook) {
  if (downloading.value) return;
  const issued = generation, ticket = identityRequest();
  downloading.value = true; error.value = ''; notice.value = '';
  try {
    const response = await fetch(`${base.value}/${encodeURIComponent(file.assetKey)}`, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([ticket.signal, AbortSignal.timeout(30000)]) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(response.status, body.error?.code || 'CONTENT_UNAVAILABLE'); }
    if (!response.headers.get('content-type')?.startsWith(file.mediaType)) throw new Error('下载内容不是 Excel 文件，请重试。');
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
    if (bytes.byteLength !== file.byteLength || digest !== file.sha256) throw new Error('文件校验未通过，请重新下载。');
    if (issued !== generation || !ticket.current()) return;
    const url = URL.createObjectURL(new Blob([bytes], { type: file.mediaType }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = '已发起下载。处理后回到本页填写结果；网站不会读取本地 Excel。';
  } catch (cause) {
    if (issued !== generation || !ticket.current()) return;
    if (cause instanceof ApiError && cause.status === 401) auth.expire();
    else error.value = cause instanceof ApiError ? errorText(cause) : cause instanceof Error && cause.name !== 'AbortError' ? cause.message : '下载中断，请重试。当前填写不会丢失。';
  } finally { ticket.finish(); if (issued === generation) downloading.value = false; }
}
watch(() => [props.runId, props.taskVersionId], () => void load(), { immediate: true });
onBeforeUnmount(() => { stopIdentity(); clear(); });
</script>

<template>
  <section class="workbook-download" aria-label="下载本次体验的学习材料" :aria-busy="loading || downloading">
    <p v-if="loading" role="status">正在读取本次体验的文件…</p>
    <template v-for="file in files" :key="file.assetKey">
      <h2>{{ file.filename.replace(/-\d+\.\d+\.\d+\.xlsx$/, '') }}</h2>
      <a :href="`${base}/${file.assetKey}`" :download="file.filename" :aria-disabled="downloading" @click.prevent="download(file)">
        {{ downloading ? '正在核对并下载…' : `下载 ${file.filename}` }}
      </a>
      <span class="workbook-meta">Excel · {{ (file.byteLength / 1024).toFixed(1) }} KB · {{ file.rowCount }} 条原始记录 · 文件版本 {{ file.workbookVersion }}</span>
      <p>合成教学材料，包含练习区、原始数据和字段说明。下载后在本地查看或处理，再回来填写关键结果和理由，不需要上传文件。</p>
      <details><summary>文件打不开，或暂时不方便用 Excel？</summary><p>这是不含宏的 .xlsx 文件。可以先使用本页提供的计算按钮继续；网站计算的结果会明确标注来源，不会算作你已完成本地处理。其他表格软件的兼容性尚未验证。</p></details>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" class="plain-button text-link" @click="load">重新读取文件</button></p>
  </section>
</template>

<style scoped>
.workbook-download { border-block: 1px solid var(--line, #cac8c0); padding: 1.2rem 0; margin: 1.5rem 0 2rem; overflow-wrap: anywhere; }
.workbook-download h2 { font-size: 1.15rem; margin: 0 0 .5rem; }
.workbook-download a { color: var(--accent, #3546ff); text-decoration: underline; text-underline-offset: .25em; font-size: 1.08rem; line-height: 1.65; }
.workbook-download a:focus-visible, summary:focus-visible { outline: 2px solid #3546ff; outline-offset: 4px; }
.workbook-meta { display: block; color: #60636a; font-size: .85rem; margin-top: .4rem; }
.workbook-download p { max-width: 65ch; line-height: 1.65; }
.workbook-download summary { cursor: pointer; text-decoration: underline; text-underline-offset: .2em; }
.workbook-download [role=alert] { color: #9b332e; }
</style>
