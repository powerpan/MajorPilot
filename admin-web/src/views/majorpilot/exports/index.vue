<script setup lang="ts">
import { onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { operations, operationKey, downloadOperationsBlob } from '@/api/majorpilot'
import type { ExportDataset, ExportStatus, Filters, Query } from '@/types/majorpilot'
import OperationsFilters from '../shared/OperationsFilters.vue'
import { useOperationsScope } from '../shared/scope'
import { time } from '../shared/format'
import '../shared/operations.css'
const route=useRoute(),router=useRouter(),dataset=ref<ExportDataset>('STUDENTS'),purpose=ref(''),fields=ref<string[]>([]),filters=ref<Filters>({}),current=ref<ExportStatus|null>(null),error=ref(''),busy=ref(false)
const columns:Record<ExportDataset,string[]>={STUDENTS:['alias','status','createdAt','emailVerifiedAt','startedMajorCount','closedMajorCount'],EXPERIENCE_RUNS:['studentAlias','experienceRunId','majorCode','taskVersionId','status','startedAt','closedAt','attemptNo'],REPORTS:['studentAlias','reportId','reportType','majorCode','status','firstReadyAt','readyAt','generationMode','versionNo'],METRICS:['metric','majorCode','numerator','denominator','rate','cohortCount','immatureCount','anchor','windowDays']}
const scope=useOperationsScope(()=>{current.value=null;purpose.value='';error.value='';busy.value=false})
let keyFor=operationKey()
watch(dataset,()=>{fields.value=[];delete filters.value.reportType})
function apply(value:Query){filters.value={...value};error.value=''}
async function create(){const ticket=scope.ticket();busy.value=true;error.value='';try{const body={dataset:dataset.value,filters:filters.value,fields:fields.value,purpose:purpose.value};const result=await operations<ExportStatus>('/exports',{method:'POST',body,key:keyFor(body),signal:ticket.signal});if(ticket.current()){current.value=result;purpose.value='';keyFor=operationKey();await router.replace({query:{exportId:result.exportId}})}}catch(cause){if(ticket.current())error.value=cause instanceof Error?cause.message:'未能申请导出。'}finally{if(ticket.current())busy.value=false}}
async function refresh(id=current.value?.exportId){if(!id)return;const ticket=scope.ticket();busy.value=true;error.value='';try{const result=await operations<ExportStatus>(`/exports/${id}`,{signal:ticket.signal});if(ticket.current())current.value=result}catch(cause){if(ticket.current())error.value=cause instanceof Error?cause.message:'无法读取导出。'}finally{if(ticket.current())busy.value=false}}
async function download(){if(!current.value)return;const ticket=scope.ticket();busy.value=true;error.value='';try{const result=await operations<Blob>(`/exports/${current.value.exportId}/download`,{blob:true,signal:ticket.signal});if(ticket.current())downloadOperationsBlob(result)}catch(cause){if(ticket.current())error.value=cause instanceof Error?cause.message:'未能下载文件。'}finally{if(ticket.current())busy.value=false}}
const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!busy.value&&['REQUESTED','PROCESSING'].includes(current.value?.status||''))void refresh()},5000)
onBeforeUnmount(()=>clearInterval(timer))
function restore(){const id=route.query.exportId;if(typeof id==='string'&&/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id))void refresh(id)}
let activated=false
onMounted(restore)
onActivated(()=>{if(activated)restore();activated=true})
</script>
<template><main class="mp-operations"><h1>受控分析导出</h1><p class="mp-subtitle">版本化白名单 CSV；只允许本次发起的操作员查询和下载，不包含邮箱、答案、反思、报告正文或模型内容。</p><p class="mp-warning">最多 10,000 行，超过上限会失败而不截断。文件 24 小时过期；关联学生删除后旧文件立即撤销。数据默认排除 TEST / BOT / 删除中主体。</p>
  <form class="mp-action-form" @submit.prevent="create"><label>数据集<select v-model="dataset" aria-label="数据集"><option value="STUDENTS">学生摘要</option><option value="EXPERIENCE_RUNS">体验运行摘要</option><option value="REPORTS">报告摘要</option><option value="METRICS">KPI</option></select></label><fieldset><legend>选择白名单字段（至少一项）</legend><label v-for="field in columns[dataset]" :key="field"><input v-model="fields" type="checkbox" :value="field" />{{ field }}</label></fieldset><label>本次导出用途（10–500 字）<textarea v-model="purpose" required minlength="10" maxlength="500" /></label><div><el-button type="primary" native-type="submit" :disabled="!fields.length" :loading="busy">申请 CSV 导出</el-button></div></form>
  <h2>固定本次导出的筛选范围</h2><OperationsFilters :reports="dataset==='REPORTS'" :busy="busy" @apply="apply" /><p class="mp-muted">点击“应用筛选”后再申请。当前已应用：{{ Object.keys(filters).length ? JSON.stringify(filters) : '默认最近 90 天、全部版本与专业' }}</p>
  <el-alert v-if="error" type="error" :title="error" :closable="false" />
  <section v-if="current" class="mp-section"><h2>本次导出状态 · {{ current.status }}</h2><dl class="mp-safe-detail"><dt>编号</dt><dd>{{ current.exportId }}</dd><dt>结构版本</dt><dd>{{ current.schemaVersion }}</dd><dt>时间口径</dt><dd>{{ current.timeAnchor }}</dd><dt>固定范围</dt><dd>{{ JSON.stringify(current.filters) }}</dd><dt>字段</dt><dd>{{ current.fields.join(' / ') }}</dd><dt>行数</dt><dd>{{ current.rowCount ?? '—（尚未生成）' }}</dd><dt>申请时间</dt><dd>{{ time(current.requestedAt) }}</dd><dt>有效至</dt><dd>{{ time(current.expiresAt) }}</dd><dt>安全失败码</dt><dd>{{ current.failureCode || '—' }}</dd></dl><p v-for="note in current.scopeNotes" :key="note" class="mp-scope">{{ note }}</p><el-button :disabled="busy" @click="refresh()">刷新状态</el-button><el-button v-if="current.status==='READY'" type="primary" :loading="busy" @click="download">审计后下载 CSV</el-button></section>
</main></template>
