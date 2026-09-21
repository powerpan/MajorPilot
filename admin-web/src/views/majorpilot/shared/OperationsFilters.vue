<script setup lang="ts">
import { reactive } from 'vue'
import type { Query } from '@/types/majorpilot'
const props = defineProps<{ reports?: boolean; list?: boolean; runs?: boolean; busy?: boolean; mode?: 'tasks' | 'audit' }>()
const emit = defineEmits<{ apply: [query: Query] }>()
const form = reactive({ from: '', to: '', asOf: '', majorCode: '', taskVersionId: '', questionnaireVersion: '', recommendationRuleVersion: '', reportType: '', status: '', studentId: '', runMode: '', exclusionCode: '' })
function submit() {
  const result: Record<string,string> = {}
  for (const [key,value] of Object.entries(form)) if (value) result[key] = ['from','to','asOf'].includes(key) ? new Date(value).toISOString() : value.trim()
  emit('apply', result as Query)
}
function reset() { for (const key of Object.keys(form) as (keyof typeof form)[]) form[key] = ''; submit() }
</script>
<template><form class="mp-filters" @submit.prevent="submit">
  <template v-if="props.mode!=='tasks'"><label>起始时间<input v-model="form.from" type="datetime-local" /></label><label>结束时间<input v-model="form.to" type="datetime-local" /></label><label>统计截止<input v-model="form.asOf" type="datetime-local" /></label></template>
  <template v-if="props.mode!=='audit'">
  <label>专业<select v-model="form.majorCode" aria-label="专业"><option value="">全部专业</option><option value="AI">AI</option><option value="DATA_SCIENCE">DS</option><option value="BUSINESS_ANALYTICS">BA</option></select></label>
  <label>任务版本 ID<input v-model="form.taskVersionId" placeholder="全部版本" /></label><template v-if="props.mode!=='tasks'"><label>问卷版本<input v-model="form.questionnaireVersion" placeholder="全部版本" /></label><label>推荐规则版本<input v-model="form.recommendationRuleVersion" placeholder="全部版本" /></label></template></template>
  <label v-if="props.mode==='tasks'">状态<select v-model="form.status" aria-label="状态"><option value="">全部</option><option value="DRAFT">DRAFT</option><option value="REVIEW">REVIEW</option><option value="PUBLISHED">PUBLISHED</option><option value="RETIRED">RETIRED</option></select></label>
  <label v-if="props.mode==='audit'">学生公有 ID<input v-model="form.studentId" placeholder="全部学生" /></label>
  <template v-if="props.list"><label>状态<input v-model="form.status" placeholder="全部状态" /></label><label>学生公有 ID<input v-model="form.studentId" placeholder="全部学生" /></label><label v-if="props.runs">运行模式<select v-model="form.runMode" aria-label="运行模式"><option value="">全部</option><option value="STANDARD">STANDARD</option><option value="REVIEW_PREVIEW">REVIEW_PREVIEW</option></select></label><label>分析标记<select v-model="form.exclusionCode" aria-label="分析标记"><option value="">全部</option><option value="NONE">无排除标记</option><option value="TEST">TEST</option><option value="BOT">BOT</option></select></label></template>
  <label v-if="props.reports">报告类型<select v-model="form.reportType" aria-label="报告类型"><option value="">全部类型</option><option value="EXPERIENCE">单次体验</option><option value="COMPARISON">专业比较</option></select></label>
  <div class="mp-filter-actions"><el-button type="primary" native-type="submit" :loading="busy">应用筛选</el-button><el-button :disabled="busy" @click="reset">恢复全部</el-button></div>
</form></template>
