<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { readDeletionReceipt } from '../stores/privacy';
import { ApiError } from '../lib/api';
import type { DeletionReceipt } from '../types/privacy';
const route = useRoute(), receipt = ref<DeletionReceipt | null>(null), error = ref(''), busy = ref(false);
const controller = new AbortController();
let generation = 0;
const status = computed(() => ({ REQUESTED: '请求已创建', PROCESSING: '正在处理删除', COMPLETED: '删除已完成', ACTION_REQUIRED: '处理需要进一步核查' })[receipt.value?.status || 'REQUESTED']);
function time(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'; }
async function load() {
  const issued = ++generation; busy.value = true; error.value = ''; receipt.value = null;
  try { const value = await readDeletionReceipt(String(route.params.receiptId), controller.signal); if (!controller.signal.aborted && issued === generation) receipt.value = value; }
  catch (cause) { if (!controller.signal.aborted && issued === generation) { error.value = cause instanceof ApiError && cause.status === 404 ? '回执不存在、已过期，或此浏览器没有有效的回执凭证。仅凭编号或邮箱不能自动找回；如需协助，请通过项目提供的人工支持渠道核验。' : '暂时无法查询回执，请稍后刷新。这不代表删除已完成或回执已失效。'; } }
  finally { if (!controller.signal.aborted && issued === generation) busy.value = false; }
}
watch(() => route.params.receiptId, load);
onMounted(load); onBeforeUnmount(() => controller.abort());
</script>
<template><main class="content-page privacy-receipt"><p class="eyebrow">PRIVATE DELETION RECEIPT</p><h1 class="serif">账户删除回执</h1><p>此页面仅显示处理状态与时间，不包含账户资料。</p><p v-if="error" class="error-notice" role="alert">{{ error }}</p><section v-if="receipt" class="privacy-receipt-status"><h2>{{ status }}</h2><p v-if="!receipt.confirmedAt">请求尚未确认，账户删除还未开始。</p><p v-else-if="receipt.status !== 'COMPLETED'">确认已受理，正在尽快处理，最迟 30 天内完成。受理不等于删除完成。</p><dl><dt>请求时间</dt><dd>{{ time(receipt.requestedAt) }}</dd><dt>确认时间</dt><dd>{{ time(receipt.confirmedAt) }}</dd><dt>完成时间</dt><dd>{{ time(receipt.completedAt) }}</dd><dt>回执有效至</dt><dd>{{ time(receipt.expiresAt) }}</dd></dl></section><button class="quiet-button" :disabled="busy" @click="load">{{ busy ? '正在查询…' : '刷新回执状态' }}</button><p class="privacy-fine">查询依赖此浏览器的专用安全 Cookie。清除 Cookie、换设备或回执过期后，编号本身不能恢复访问。</p><RouterLink to="/" class="text-link">返回首页</RouterLink></main></template>
