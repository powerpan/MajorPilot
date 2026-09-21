<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue'
import { operations, operationKey } from '@/api/majorpilot'
import type { Page, Query, StudentRow, RunRow, ReportRow, TaskRow, AuditRow, StudentDetail, RunDetail } from '@/types/majorpilot'
import { allowed, useOperationsScope } from './scope'
import { cell } from './format'
import OperationsFilters from './OperationsFilters.vue'
import './operations.css'
type Kind = 'students' | 'experience-runs' | 'reports' | 'task-versions' | 'audit-events'
type Row = StudentRow | RunRow | ReportRow | TaskRow | AuditRow
interface Version { reportVersionId: string; versionNo: number; status: string; generationMode: string | null; failureCode: string | null; createdAt: string; completedAt: string | null }
interface ReviewContext { taskVersionId: string; manifestPath: string; requiredReviewChecks: string[]; status: string; revision: number }
const props = defineProps<{ kind: Kind }>()
const configs: Record<Kind, { title: string; id: string; path: string; columns: [string,string][]; sort: string[] }> = {
  students: { title:'学生账户',id:'studentId',path:'/students',columns:[['alias','假名'],['studentId','公有 ID'],['status','状态'],['analyticsExclusionCode','分析排除'],['profileCount','问卷版本'],['startedMajorCount','开始专业'],['closedMajorCount','关闭专业'],['createdAt','注册时间'],['lastLoginAt','最近登录']],sort:['createdAt','lastLoginAt','status'] },
  'experience-runs': {title:'体验运行',id:'experienceRunId',path:'/experience-runs',columns:[['studentAlias','学生假名'],['experienceRunId','运行 ID'],['majorCode','专业'],['runMode','模式'],['status','状态'],['taskVersionCode','任务版本'],['currentStepKey','当前步骤'],['attemptNo','尝试编号'],['lastActivityAt','最近活动']],sort:['lastActivityAt','startedAt','createdAt','status']},
  reports:{title:'报告与生成',id:'reportId',path:'/reports/page',columns:[['studentAlias','学生假名'],['reportId','报告 ID'],['reportType','类型'],['majorCode','专业'],['status','状态'],['versionNo','当前版本'],['generationMode','生成方式'],['failureCode','安全失败码'],['firstReadyAt','首次可读']],sort:['requestedAt','firstReadyAt','status']},
  'task-versions':{title:'内容版本',id:'taskVersionId',path:'/task-versions/page',columns:[['title','标题'],['taskVersionId','版本 ID'],['majorCode','专业'],['contentKind','内容类型'],['versionCode','版本'],['status','状态'],['publishedAt','发布时间']],sort:['createdAt','publishedAt','status']},
  'audit-events':{title:'安全审计',id:'auditId',path:'/audit-events',columns:[['auditId','审计 ID'],['operatorId','操作员'],['actionCode','动作'],['targetType','目标类型'],['targetPublicId','目标 ID'],['studentAlias','学生假名'],['reasonCode','安全原因码'],['occurredAt','时间']],sort:['occurredAt','actionCode']}
}
const config = computed(() => configs[props.kind]), rows = ref<Row[]>([]), total = ref(0), notes = ref<string[]>([]), busy = ref(false), error = ref(''), success = ref('')
const query = reactive<Query>({pageNum:1,pageSize:20,sortOrder:'desc'})
const selected = ref<Row | null>(null), action = ref(''), dialog = ref(false), actionBusy = ref(false), details = ref<unknown>(null), sensitive = ref<unknown>(null), versions = ref<Version[]>([]), review = ref<ReviewContext | null>(null)
const reason = ref(''), purpose = ref(''), reasonCode = ref(''), exclusion = ref('NONE'), evidenceMode = ref('REUSE_READY_EVIDENCE'), evidenceRule = ref(''), checked = ref<string[]>([]), acknowledged = ref(false)
let actionGeneration = 0
function close() { actionGeneration += 1; dialog.value = false; selected.value = null; details.value = null; sensitive.value = null; versions.value = []; review.value = null; reason.value = ''; purpose.value = ''; checked.value = []; acknowledged.value = false; actionBusy.value = false }
const scope = useOperationsScope(() => { rows.value=[]; total.value=0; notes.value=[]; error.value=''; success.value=''; busy.value=false; close() })
const keyFor = operationKey()
function id(row: Row) { return cell(row, config.value.id) }
function revision(row: Row) { return 'revision' in row ? row.revision : 0 }
const actionTitle = computed(() => ({detail:'只读记录详情',sensitive:'必要敏感内容读取',exclusion:'修改分析排除标记',recovery:'建立恢复运行',regenerate:'重新生成报告',history:'报告版本历史',publish:'人工审核与发布',validate:'验证登记内容',retire:'退役内容版本'})[action.value] || '操作')
async function load(filters?: Query) {
  scope.cancel()
  if (filters) { for (const key of Object.keys(query) as (keyof Query)[]) delete query[key]; Object.assign(query,filters,{pageNum:1,pageSize:20,sortOrder:'desc'}) }
  busy.value=true; const ticket=scope.ticket()
  try { const result=await operations<Page<Row>>(config.value.path,{query,signal:ticket.signal}); if(ticket.current()){rows.value=result.rows;total.value=result.total;notes.value=result.scopeNotes || []} }
  catch(cause){if(ticket.current())error.value=cause instanceof Error?cause.message:'无法读取记录。'}
  finally{if(ticket.current())busy.value=false}
}
async function open(row: Row, mode: string) {
  close(); selected.value=row;action.value=mode;dialog.value=true;error.value='';reasonCode.value=mode==='recovery'?'TECHNICAL_FAILURE':'OPERATOR_REQUEST';exclusion.value='analyticsExclusionCode' in row ? row.analyticsExclusionCode || 'NONE' : 'NONE'
  const issued=actionGeneration,ticket=scope.ticket(); actionBusy.value=true
  try {
    let value: unknown
    if(mode==='detail') {
      if(props.kind==='students')value=await operations<StudentDetail>(`/students/${id(row)}`,{signal:ticket.signal})
      else if(props.kind==='experience-runs')value=await operations<RunDetail>(`/experience-runs/${id(row)}`,{signal:ticket.signal})
      else value=row
      if(ticket.current()&&issued===actionGeneration)details.value=value
    } else if(mode==='history') {
      const result=await operations<Version[]>(`/reports/${id(row)}/versions`,{signal:ticket.signal});if(ticket.current()&&issued===actionGeneration)versions.value=result
    } else if(mode==='publish'||mode==='validate'){
      const result=await operations<ReviewContext>(`/task-versions/${id(row)}/review-context`,{signal:ticket.signal});if(ticket.current()&&issued===actionGeneration)review.value=result
    }
  }catch(cause){if(ticket.current()&&issued===actionGeneration)error.value=cause instanceof Error?cause.message:'读取失败。'}finally{if(ticket.current()&&issued===actionGeneration)actionBusy.value=false}
}
async function readVersion(version: Version) {
  if(!selected.value || !acknowledged.value)return
  const issued=actionGeneration,ticket=scope.ticket();actionBusy.value=true
  try{const result=await operations<unknown>(`/reports/${id(selected.value)}/versions/${version.reportVersionId}`,{signal:ticket.signal});if(ticket.current()&&issued===actionGeneration)sensitive.value=result}
  catch(cause){if(ticket.current()&&issued===actionGeneration)error.value=cause instanceof Error?cause.message:'读取失败。'}finally{if(ticket.current()&&issued===actionGeneration)actionBusy.value=false}
}
async function perform() {
  const row=selected.value;if(!row)return
  const issued=actionGeneration,ticket=scope.ticket();actionBusy.value=true;error.value=''
  let path='',body: object={},method='POST'
  const entity=id(row)
  if(action.value==='sensitive'){path=`/${props.kind}/${entity}/sensitive-view`;body={purpose:purpose.value,reason:reason.value}}
  if(action.value==='exclusion'){path=`/students/${entity}/analytics-exclusion`;method='PATCH';body={expectedRevision:revision(row),exclusionCode:exclusion.value,reason:reason.value}}
  if(action.value==='recovery'){path=`/experience-runs/${entity}/recovery-runs`;body={expectedRevision:revision(row),reasonCode:reasonCode.value,reasonText:reason.value}}
  if(action.value==='regenerate'){path=`/reports/${entity}/regenerations`;body={expectedRevision:revision(row),reasonCode:reasonCode.value,reason:reason.value,evidenceMode:evidenceMode.value,...(evidenceRule.value?{targetEvidenceRuleVersion:evidenceRule.value}:{})}}
  if(action.value==='retire'){path=`/task-versions/${entity}/retire`;body={expectedRevision:revision(row),reasonText:reason.value}}
  if(action.value==='validate' && review.value){path='/task-versions/validate';body={manifestPath:review.value.manifestPath}}
  if(action.value==='publish' && review.value){path=`/task-versions/${entity}/publish`;body={expectedRevision:review.value.revision,reviewChecks:Object.fromEntries(review.value.requiredReviewChecks.map(key=>[key,checked.value.includes(key)])),reasonText:reason.value}}
  try {
    if(!path)throw new Error('请先读取当前登记版本。')
    const result=await operations<unknown>(path,{method,body,key:keyFor({path,body}),signal:ticket.signal})
    if(!ticket.current()||issued!==actionGeneration)return
    if(action.value==='sensitive')sensitive.value=result
    else{close();await load();success.value='操作已受理。列表已刷新；原学生答案与历史报告没有被直接编辑。'}
  }catch(cause){if(ticket.current()&&issued===actionGeneration)error.value=cause instanceof Error?cause.message:'操作未完成。'}finally{if(ticket.current()&&issued===actionGeneration)actionBusy.value=false}
}
let activated=false
onMounted(()=>void load())
onActivated(()=>{if(activated)void load();activated=true})
</script>
<template><main class="mp-operations"><h1>{{ config.title }}</h1><p class="mp-subtitle">默认仅显示必要的假名、状态和版本。敏感读取及支持动作分别授权并记录审计；不能直接修改学生答案。</p>
  <OperationsFilters :mode="kind==='task-versions'?'tasks':kind==='audit-events'?'audit':undefined" :list="kind!=='task-versions'&&kind!=='audit-events'" :runs="kind==='experience-runs'" :reports="kind==='reports'" :busy="busy" @apply="load" />
  <p v-if="kind==='task-versions'" class="mp-warning">REVIEW 不等于已发布。技术验证不能替代专业审核与真实目标用户计时；本页不会预选审核项。</p>
  <p v-for="note in notes" :key="note" class="mp-scope">{{ note }}</p><el-alert v-if="error&&!dialog" type="error" :title="error" :closable="false" /><el-alert v-if="success" type="success" :title="success" :closable="false" />
  <div class="mp-toolbar"><span>{{ busy ? '正在读取记录…' : `共 ${total} 条` }}</span><div><label>排序 <select v-model="query.sortBy" aria-label="排序" @change="query.pageNum=1;load()"><option :value="undefined">默认</option><option v-for="key in config.sort" :key="key" :value="key">{{ key }}</option></select></label> <select v-model="query.sortOrder" aria-label="排序方向" @change="query.pageNum=1;load()"><option value="desc">降序</option><option value="asc">升序</option></select></div></div>
  <el-table v-loading="busy" :data="rows" stripe :row-key="config.id" empty-text="当前筛选下没有记录"><el-table-column v-for="[key,label] in config.columns" :key="key" :label="label" :min-width="key.endsWith('Id')?235:150"><template #default="{row}">{{ cell(row,key) }}</template></el-table-column><el-table-column v-if="kind!=='audit-events'" label="操作" fixed="right" width="190"><template #default="{row}"><div class="mp-operation-links"><el-button link type="primary" @click="open(row,'detail')">详情</el-button><template v-if="kind==='students'"><el-button v-if="allowed('student:sensitive')" link type="primary" @click="open(row,'sensitive')">敏感读取</el-button><el-button v-if="allowed('analytics:manage')" link @click="open(row,'exclusion')">分析标记</el-button></template><template v-if="kind==='experience-runs'"><el-button v-if="allowed('experience:sensitive')" link type="primary" @click="open(row,'sensitive')">敏感读取</el-button><el-button v-if="allowed('recovery:create')" link @click="open(row,'recovery')">恢复运行</el-button></template><template v-if="kind==='reports'"><el-button v-if="allowed('report:history:view')" link @click="open(row,'history')">历史</el-button><el-button v-if="allowed('report:regenerate')" link @click="open(row,'regenerate')">重生成</el-button></template><template v-if="kind==='task-versions'"><el-button v-if="allowed('task:publish')" link @click="open(row,'validate')">验证</el-button><el-button v-if="allowed('task:publish')&&row.status==='REVIEW'" link @click="open(row,'publish')">审核发布</el-button><el-button v-if="allowed('task:publish')&&row.status==='PUBLISHED'" link @click="open(row,'retire')">退役</el-button></template></div></template></el-table-column></el-table>
  <div class="mp-pagination"><label>每页 <select v-model.number="query.pageSize" aria-label="每页" @change="query.pageNum=1;load()"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label><el-pagination :current-page="query.pageNum" :page-size="query.pageSize" :total="total" layout="prev, pager, next" @current-change="query.pageNum=$event;load()" /></div>
  <el-dialog v-model="dialog" :title="actionTitle" width="min(820px, 94vw)" destroy-on-close :close-on-click-modal="false" @closed="close"><div v-loading="actionBusy" class="mp-action-form"><p v-if="selected">目标 {{ id(selected) }} · 当前 revision {{ revision(selected) }}</p><el-alert v-if="error" type="error" :title="error" :closable="false" />
    <pre v-if="action==='detail' && details">{{ JSON.stringify(details,null,2) }}</pre>
    <template v-if="action==='history'"><p>最多显示最近 50 个版本；历史不会覆盖当前版本。正文读取另需敏感权限并写审计。</p><label v-if="allowed('report:sensitive:view')"><input v-model="acknowledged" type="checkbox" />我确认本次读取是必要的账户支持操作</label><el-table :data="versions"><el-table-column prop="versionNo" label="版本" /><el-table-column prop="status" label="状态" /><el-table-column prop="generationMode" label="方式" /><el-table-column prop="failureCode" label="安全失败码" /><el-table-column v-if="allowed('report:sensitive:view')" label="正文"><template #default="{row}"><el-button link :disabled="!acknowledged||actionBusy" @click="readVersion(row)">审计后只读查看</el-button></template></el-table-column></el-table></template>
    <form v-else-if="action!=='detail'" class="mp-action-form" @submit.prevent="perform">
      <template v-if="action==='sensitive'"><p class="mp-warning">仅为本次必要支持读取。内容只在当前页面内存中显示，关闭即清除，不写浏览器存储。</p><label>用途<select v-model="purpose" aria-label="用途" required><option value="" disabled>选择用途</option><option value="SUPPORT_REQUEST">用户支持</option><option value="QUALITY_REVIEW">质量审核</option><option value="INCIDENT_REVIEW">故障核查</option><option value="PRODUCT_ANALYSIS">产品分析</option></select></label></template>
      <label v-if="action==='exclusion'">分析排除<select v-model="exclusion" aria-label="分析排除"><option value="NONE">NONE · 纳入正常统计</option><option value="TEST">TEST · 测试</option><option value="BOT">BOT · 机器人</option></select></label>
      <label v-if="action==='recovery'">原因类别<select v-model="reasonCode" aria-label="原因类别"><option value="TECHNICAL_FAILURE">技术故障</option><option value="CONTENT_ERROR">内容错误</option><option value="PROGRESS_CORRUPTION">进度损坏</option></select></label>
      <p v-if="action==='recovery'" class="mp-warning">建立新恢复运行并替换原运行，保留来源链；不直接补完成或编辑答案。</p>
      <template v-if="action==='regenerate'"><label>原因类别<select v-model="reasonCode" aria-label="原因类别"><option value="OPERATOR_REQUEST">支持请求</option><option value="GENERATION_FAILURE">生成失败</option><option value="CONTENT_CORRECTION">内容修正</option><option value="RULE_UPDATE">规则更新</option></select></label><label>证据模式<select v-model="evidenceMode" aria-label="证据模式"><option value="REUSE_READY_EVIDENCE">复用已就绪证据</option><option value="REBUILD_EVIDENCE">重新构建证据</option></select></label><label v-if="evidenceMode==='REBUILD_EVIDENCE'">目标证据规则版本<input v-model="evidenceRule" required /></label><p>提交生成任务，不直接改写已有报告。当前旧版本可读性由服务端状态决定。</p></template>
      <template v-if="action==='validate'||action==='publish'"><p v-if="review">服务器登记文件：{{ review.manifestPath }} · {{ review.status }} · revision {{ review.revision }}</p><p v-else>请关闭后重试读取登记信息；不会猜测文件路径。</p></template>
      <fieldset v-if="action==='publish'&&review"><legend>逐项完成实际审核后勾选</legend><label v-for="key in review.requiredReviewChecks" :key="key"><input v-model="checked" type="checkbox" :value="key" />{{ key }}</label></fieldset>
      <p v-if="action==='retire'" class="mp-warning">停止新体验采用此版本；历史运行继续保留其固定版本。</p>
      <label v-if="action!=='validate'">操作原因（必填）<textarea v-model="reason" required minlength="10" maxlength="500" /></label>
      <div class="mp-dialog-actions"><el-button :disabled="actionBusy" @click="close">取消</el-button><el-button type="primary" native-type="submit" :loading="actionBusy" :disabled="(action==='publish'&&(!review||checked.length!==review.requiredReviewChecks.length))||(action==='validate'&&!review)">{{ action==='sensitive'?'确认并读取':action==='publish'?'确认审核完成并发布':'确认提交' }}</el-button></div>
    </form>
    <pre v-if="sensitive">{{ JSON.stringify(sensitive,null,2) }}</pre>
  </div></el-dialog>
</main></template>
