<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'
import { operations } from '@/api/majorpilot'
import type { Overview, Query } from '@/types/majorpilot'
import OperationsFilters from '../shared/OperationsFilters.vue'
import FunnelTable from '../shared/FunnelTable.vue'
import { major, rate, time, term } from '../shared/format'
import { useOperationsScope } from '../shared/scope'
import '../shared/operations.css'
const data = ref<Overview | null>(null), busy = ref(false), error = ref(''), tab = ref('first')
let filters: Query = {}
const scope = useOperationsScope(() => { data.value = null; busy.value = false; error.value = '' })
const kpis = computed(() => data.value ? [
  { title: '首次体验 7 日完成', value: data.value.metrics.firstExperienceCompletion },
  { title: '报告带来具体收获', value: data.value.metrics.reportInsight },
  { title: '第二体验 14 日启动', value: data.value.metrics.secondExperienceStart }
] : [])
async function load(query = filters) {
  scope.cancel(); filters = { ...query }; busy.value = true
  const ticket = scope.ticket()
  try { const result = await operations<Overview>('/overview', { query: filters, signal: ticket.signal }); if (ticket.current()) data.value = result }
  catch (cause) { if (ticket.current()) error.value = cause instanceof Error ? cause.message : '暂时无法读取概览。' }
  finally { if (ticket.current()) busy.value = false }
}
let activated = false
onMounted(() => void load())
onActivated(() => { if (activated) void load(); activated = true })
</script>
<template><main class="mp-operations">
  <h1>MajorPilot 运营概览</h1><p class="mp-subtitle">观察产品价值与使用路径，不把任务表现变成专业适配分数。</p>
  <OperationsFilters :busy="busy" @apply="load" />
  <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
  <el-skeleton v-if="busy" :rows="8" animated />
  <template v-else-if="data">
    <div class="mp-scope">{{ data.metricsVersion }} · cohort 区间 [{{ time(data.from) }}, {{ time(data.to) }}) · 截止 {{ time(data.asOf) }}<br />数据更新时间 {{ time(data.dataUpdatedAt) }}。排除 TEST {{ data.exclusions.testStudents }}、BOT {{ data.exclusions.botStudents }}、删除中 {{ data.exclusions.deletionStudents }} 个主体，以及 {{ data.exclusions.nonStandardRuns }} 次非正式运行。</div>
    <div class="mp-kpis"><section v-for="kpi in kpis" :key="kpi.title" class="mp-kpi"><h2>{{ kpi.title }}</h2><strong>{{ rate(kpi.value.rate) }}</strong><p class="mp-ratio">{{ kpi.value.numerator }} / {{ kpi.value.denominator }} 人 <span v-if="kpi.value.denominator === 0">· 暂无可计算分母</span></p><p>cohort {{ kpi.value.cohortCount }} 人 · 未成熟 {{ kpi.value.immatureCount }} 人</p><p>{{ kpi.value.windowDays ? `观察窗 ${kpi.value.windowDays} 日` : '首份有效价值答卷，无固定天数窗口' }} · {{ term(kpi.value.anchor) }}</p></section></div>
    <h2>按专业查看分子与分母</h2><el-table :data="data.byMajor" stripe><el-table-column label="专业" min-width="180"><template #default="{ row }">{{ major(row.majorCode) }}</template></el-table-column><el-table-column v-for="(label,key) in { firstExperienceCompletion:'首次体验完成', reportInsight:'具体收获', secondExperienceStart:'第二体验启动' }" :key="key" :label="label" min-width="180"><template #default="{ row }">{{ rate(row.metrics[key].rate) }} · {{ row.metrics[key].numerator }} / {{ row.metrics[key].denominator }}<br /><small>未成熟 {{ row.metrics[key].immatureCount }}</small></template></el-table-column></el-table>
    <div class="mp-scope">反馈覆盖 {{ rate(data.metrics.feedbackCoverage.rate) }}（{{ data.metrics.feedbackCoverage.numerator }} / {{ data.metrics.feedbackCoverage.denominator }}）；有回答但无阅读观察 {{ data.metrics.feedbackCoverage.answeredWithoutViewed }} 人；未观察到报告阅读 {{ data.metrics.feedbackCoverage.unobservedReportCount }} 人。第二专业在首报告前开始 {{ data.metrics.secondStartTiming.before }} 人，之后开始 {{ data.metrics.secondStartTiming.after }} 人。</div>
    <details><summary>口径与覆盖说明</summary><p v-for="(note,i) in data.coverageNotes" :key="i" class="mp-muted">{{ term(note) }}</p><p class="mp-muted">历史截止只重算现存记录，不恢复已删除资料或历史排除标记。未观察到页面不等于没有发生行为。</p></details>
    <el-tabs v-model="tab" class="mp-section"><el-tab-pane label="首次价值漏斗" name="first"><FunnelTable v-for="funnel in data.funnels" :key="funnel.key" :funnel="funnel" /></el-tab-pane><el-tab-pane label="报告后比较" name="comparison"><section v-for="pair in data.comparisonByMajorPair" :key="pair.firstMajorCode + pair.secondMajorCode"><h3>{{ major(pair.firstMajorCode) }} → {{ pair.secondMajorCode ? major(pair.secondMajorCode) : '其他专业' }}</h3><FunnelTable :funnel="pair.funnel" /></section><p v-if="!data.comparisonByMajorPair.length" class="mp-empty">当前范围无可展示的专业对。</p></el-tab-pane><el-tab-pane label="步骤诊断" name="tasks"><section v-for="task in data.taskFunnels" :key="task.taskVersionId"><h3>{{ major(task.majorCode) }} · {{ task.taskVersionId }}</h3><FunnelTable :funnel="task.funnel" /><el-table :data="task.diagnostics"><el-table-column prop="stepKey" label="步骤" min-width="200" /><el-table-column v-for="(label,key) in {viewedStudents:'观察到查看',completedStudents:'完成',errorStudents:'发生错误',recoveryStudents:'恢复',hintStudents:'使用提示'}" :key="key" :prop="key" :label="label" min-width="120" /></el-table></section><p v-if="!data.taskFunnels.length" class="mp-empty">当前范围暂无正式任务步骤数据。</p></el-tab-pane><el-tab-pane label="运行健康" name="health"><p class="mp-warning">技术运行状态包含测试活动，不是产品 KPI。更新于 {{ time(data.health.checkedAt) }}。</p><div class="mp-health-numbers"><p>报告 READY 版本 {{ data.health.reportReadyVersionCount }}</p><p>回退版本 {{ data.health.reportFallbackVersionCount }}</p><p>超期删除 {{ data.health.overdueDeletionCount }}</p><p>已知费用 {{ data.health.knownEstimatedCost ?? '—（未知）' }}</p><p>未知费用调用 {{ data.health.unknownCostCalls ?? '—（未知）' }}</p></div><h3>后台作业</h3><el-table :data="data.health.jobs"><el-table-column prop="jobType" label="任务类型" /><el-table-column prop="status" label="状态" /><el-table-column prop="count" label="数量" /></el-table><h3>安全错误代码</h3><el-table :data="data.health.safeErrors"><el-table-column prop="source" label="来源" /><el-table-column prop="code" label="代码" /><el-table-column prop="count" label="数量" /></el-table><h3>留存任务</h3><el-table :data="data.health.retention"><el-table-column prop="policyKey" label="策略" min-width="180" /><el-table-column label="最近完成" min-width="180"><template #default="{ row }">{{ time(row.lastCompletedAt) }}</template></el-table-column><el-table-column prop="lastErrorCode" label="安全失败码" min-width="180" /><el-table-column prop="deletedCount" label="最近删除数量" /><el-table-column label="下一到期" min-width="180"><template #default="{ row }">{{ time(row.nextDueAt) }}</template></el-table-column></el-table><p v-for="(note,i) in data.health.coverageNotes" :key="i" class="mp-muted">{{ note }}</p></el-tab-pane></el-tabs>
    <section class="mp-section"><h2>活动观察覆盖</h2><p class="mp-muted">{{ data.diagnostics.runsWithActivityObservations }} / {{ data.diagnostics.eligibleStartedRuns }} 次已开始运行有观察记录（{{ rate(data.diagnostics.activityObservationCoverage) }}）。可观察活跃时长合计 {{ data.diagnostics.observedActiveSeconds }} 秒，按相邻最多 10 分钟累计；不是精确学习时长。</p></section>
  </template>
</main></template>
