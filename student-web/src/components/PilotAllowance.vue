<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { api } from "../lib/api";
import { identityRequest, onIdentityChange } from "../stores/auth";
import type { PilotStatus } from "../lib/pilot";
const status=ref<PilotStatus|null>(null),failed=ref(false);
const unsubscribe=onIdentityChange(()=>{status.value=null;});onBeforeUnmount(unsubscribe);
async function load(){const ticket=identityRequest();try{const value=await api<PilotStatus>("/api/app/v1/pilot",{signal:ticket.signal});ticket.assertCurrent();status.value=value;failed.value=false;}catch{if(ticket.current())failed.value=true;}finally{ticket.finish();}}
onMounted(load);
</script>
<template><aside class="pilot-allowance" aria-label="测试版报告额度"><template v-if="status"><strong>本轮测试</strong><span>单专业报告还可生成 {{status.allowances.experience.remaining}} / {{status.allowances.experience.limit}} 次</span><span>比较报告还可生成 {{status.allowances.comparison.remaining}} / {{status.allowances.comparison.limit}} 次</span><small>含正在准备的名额；阅读不占次数。额度用完仍可查看已有报告，继续作答也会保存。</small></template><p v-else-if="failed">额度暂时无法读取。<button class="text-link" @click="load">重试</button></p><p v-else>正在读取报告额度…</p></aside></template>
<style scoped>.pilot-allowance{display:flex;gap:12px 28px;flex-wrap:wrap;margin:20px 0;padding:20px 0;border-bottom:1px solid #b4b3af;font-size:14px}.pilot-allowance strong{color:#454bff}.pilot-allowance small{flex-basis:100%;color:#676b74}</style>
