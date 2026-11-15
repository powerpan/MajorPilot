<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useWorkspace } from '../../stores/workspace';
import { identityRequest, onIdentityChange } from '../../stores/auth';
import { api, errorText, stableOperation } from '../../lib/api';
import { answerIssue, attentionTarget, createAttention } from '../../lib/workspace-attention';
import { currentLocalResult } from '../../lib/local-result-state';
import ClassifierConfig from './ClassifierConfig.vue';
import ClassifierMetrics from './ClassifierMetrics.vue';
import type { InputSchema } from '../../types/workspace';
type GuideStep = { stepKey: string; title: string; introduction: string; fields: { key: string; label: string; help: string; options?: Record<string,string> }[]; checkpointId: string|null; transferCheckpointId: string|null; local: null|{ valueKeys:string[]; defaultSpecification:Record<string,unknown>; specificationSchema:InputSchema } };
type Support = {supportId:string;kind:string;text:string};
type Checkpoint = {checkpointId:string;stepKey:string;supports:Support[]};
type LearningEvent = {sequence:number;kind:string;checkpointId:string;payload:{role?:string;supportId?:string;answer?:Record<string,unknown>}};
type LocalRecord = {stepKey:string;revision:number;assistance:boolean;calculated?:Record<string,string>;result?:{status:string;original:Record<string,unknown>;checks:{field:string;matched:boolean;expectedAtEnteredPrecision:string|null}[]}};
type State = {guide:{methodName:string;scope:string;steps:GuideStep[];checkpoints:Checkpoint[]};sequence:number;events:LearningEvent[];localResults:LocalRecord[];workbooks:{workbookVersion:string;sha256:string}[]};
const w=useWorkspace(), state=ref<State|null>(null), busy=ref(false), error=ref(''), region=ref<HTMLElement|null>(null), attention=createAttention();
const emit=defineEmits<{ execute:[] }>();
let pendingNotice:{message:string;field:string}|null=null;
let epoch=0;const operations=new Map<string,ReturnType<typeof stableOperation>>();
const selected=computed(()=>state.value?.guide.steps.find(s=>s.stepKey===w.selectedStep));
const checkpoint=computed(()=>state.value?.guide.checkpoints.find(c=>c.checkpointId===(selected.value?.checkpointId||selected.value?.transferCheckpointId)));
const attempts=computed(()=>state.value?.events.filter(e=>e.kind==='ATTEMPT_SUBMITTED'&&e.checkpointId===checkpoint.value?.checkpointId&&e.payload.role!=='TRANSFER')||[]);
const submittedTransfer = computed(() => state.value?.events.find(
  e => e.kind === 'ATTEMPT_SUBMITTED' && e.checkpointId === checkpoint.value?.checkpointId && e.payload.role === 'TRANSFER',
));
const isTransferStep = computed(() => !!selected.value?.transferCheckpointId);
const submitted = computed(() => isTransferStep.value ? submittedTransfer.value : attempts.value.at(-1));
const exhausted = computed(() => !!submittedTransfer.value || (!isTransferStep.value && attempts.value.length >= 2));
const answerChanged = computed(() => !!submitted.value && stable(submitted.value.payload.answer) !== stable(w.answer));
const needsRestore = computed(() => exhausted.value && answerChanged.value);
const submittedHere = computed(() => isTransferStep.value ? (submittedTransfer.value ? [submittedTransfer.value] : []) : attempts.value);
const submitLabel = computed(() => {
  if (isTransferStep.value) return submittedTransfer.value ? '新情境回答已提交' : '提交新情境回答';
  if (attempts.value.length >= 2) return '两次提交均已保留';
  if (submittedTransfer.value) return '新情境已提交，本题修改已结束';
  return attempts.value.length ? '提交一次修改' : '提交这一小步';
});
const inputLocked=computed(()=>locked.value||exhausted.value);
const locked=computed(()=>w.readOnly||w.busy||busy.value||!!w.recovered||w.conflict);
const lastCheck=computed(()=>currentLocalResult(state.value?.localResults||[],w.selectedStep,local.value));
const statusNames:Record<string,string>={MATCHED:'填写数值与按所选规则计算的结果一致。',MISMATCHED:'有些数值不同。原值已保存，可以检查后修改，也可以保留当前解释继续。',NOT_REPRODUCIBLE:'这套本地方法暂不能复算。我们保留你的说明，不把它当作答错。',VERSION_MISMATCH:'填写的文件版本不同。请下载当前文件，或在说明里保留使用旧文件的情况。',NOT_CHECKED:'暂时无法核对，已保存你的填写。可以稍后重试。'};
const labels:Record<string,string>={duplicatePolicy:'重复记录怎么处理',excludedRowIds:'另外排除的原始行ID（逗号分开，可留空）',earlyThroughDay:'较早开始：第0天至第几天',latestDay:'较晚开始：到第几天为止',baselineStartWeek:'前一批范围：起始批次',baselineEndWeek:'前一批范围：结束批次',comparisonStartWeek:'后一批范围：起始批次',comparisonEndWeek:'后一批范围：结束批次',courseTrack:'课程范围',signupSource:'报名来源',numerator:'后一步人数（分子）',denominator:'前一步人数（分母）',retainedRows:'保留记录（行）',uniqueLearners:'不同学员（人）',duplicateRowsRemoved:'删除的完全重复记录（行）',baselineNumerator:'前一批：后一步人数',baselineDenominator:'前一批：前一步人数',baselinePercent:'前一批：所选比例（%）',comparisonNumerator:'后一批：后一步人数',comparisonDenominator:'后一批：前一步人数',comparisonPercent:'后一批：所选比例（%）'};
const choices:Record<string,string>={REMOVE_EXACT:'只删除整行完全相同的重复',KEEP_ALL:'全部保留（请解释）',ALL:'全部',FOUNDATIONS:'基础课程',APPLIED:'应用课程',ORGANIC:'自然来源',PARTNER:'合作渠道',CAMPAIGN:'活动来源',enrolled_count:'报名人数',first_lesson_count:'开始首课人数',week_one_active_count:'首周活跃人数',assignment_started_count:'开始作业人数',assignment_submitted_count:'提交作业人数',completed_count:'完成人数'};
const metricLabel=(key:string)=>{if(labels[key])return labels[key];const [group,metric]=key.split('.');const names:Record<string,string>={earlyCount:'较早组人数',earlyCompleted:'较早组完成人数',earlyPercent:'较早组完成率（%）',laterCount:'较晚组人数',laterCompleted:'较晚组完成人数',laterPercent:'较晚组完成率（%）'};return `${group==='all'?'全部课程':choices[group!]||group} · ${names[metric!]||metric}`;};
const local=computed(()=>(w.answer.local||{}) as {workbookVersion?:string;workbookSha256?:string;method?:string;specification?:Record<string,unknown>;values?:Record<string,string>;reason?:string});
function edit(key:string,value:unknown){w.edit({...w.answer,[key]:value,...(key==='transferMode'&&value==='SKIP'?{transfer:''}:{})});}
function stable(value:unknown):string { if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value); }
function editLocal(key:string,value:unknown){edit('local',{...local.value,[key]:value});}
function spec(key:string,value:unknown){editLocal('specification',{...local.value.specification,[key]:value});}
async function request<T>(suffix:string,body?:unknown):Promise<T>{const ticket=identityRequest(),issued=epoch;try{let op=operations.get(suffix);if(!op){op=stableOperation();operations.set(suffix,op);}const value=await api<T>(`/api/app/v1/experience-runs/${w.run!.runId}/learning${suffix}`,{signal:ticket.signal,...(body===undefined?{}:{method:'POST',body,key:op(body)})});ticket.assertCurrent();if(issued!==epoch)throw new Error('页面已切换，请重新查看当前记录。');return value;}finally{ticket.finish();}}
function reset(){pendingNotice=null;epoch++;state.value=null;error.value='';busy.value=false;attention.clear();operations.clear();}
const stop=onIdentityChange(reset);onBeforeUnmount(()=>{stop();reset();});
async function locate(message:string,field='learning'){if(busy.value){pendingNotice={message,field};return;}await nextTick();const target=region.value&&(attentionTarget(region.value,field)||region.value);if(target)attention.show(target,message);}
watch(busy,value=>{if(!value&&pendingNotice){const notice=pendingNotice;pendingNotice=null;void locate(notice.message,notice.field);}});
async function load(){reset();const issued=epoch;if(!w.run||!w.step||!w.selectionReady)return;try{state.value=await request<State>('');if(issued!==epoch)return;
  if(selected.value?.transferCheckpointId&&!w.answer.transferMode&&!w.readOnly&&!w.recovered)w.edit({...w.answer,transferMode:'ANSWER',transfer:w.answer.transfer||''});
  if(selected.value?.local&&!w.answer.local&&!w.readOnly&&!w.recovered){const book=state.value.workbooks[0];edit('local',{workbookVersion:book?.workbookVersion||'',workbookSha256:book?.sha256||'',method:'SUPPORTED',specification:JSON.parse(JSON.stringify(selected.value.local.defaultSpecification)),values:{},reason:''});}
  const cp=checkpoint.value,basic=cp?.supports.find(s=>s.kind==='BASIC');
  if(cp&&basic&&!w.readOnly&&!state.value.events.some(e=>e.payload.supportId===basic.supportId))state.value=await request<State>('/events',{expectedSequence:state.value.sequence,stepKey:w.selectedStep,kind:'SUPPORT_PROVIDED',checkpointId:cp.checkpointId,supportId:basic.supportId});
}catch(e){if(issued===epoch)error.value=errorText(e);}}
// Progress polling replaces the run object even when the current step is unchanged.
watch([() => w.run?.runId, () => w.selectedStep, () => w.selectionReady], () => void load(), { immediate: true });
async function support(s:Support){if(!state.value||!checkpoint.value||locked.value)return;const issued=epoch;busy.value=true;try{state.value=await request<State>('/events',{expectedSequence:state.value.sequence,stepKey:w.selectedStep,kind:s.kind==='RECOVERY'?'BASELINE_SELECTED':'SUPPORT_PROVIDED',checkpointId:checkpoint.value.checkpointId,supportId:s.supportId});error.value='';}catch(e){if(issued===epoch){error.value=errorText(e);await locate(error.value);}}finally{if(issued===epoch)busy.value=false;}}
function executionIssue() {
  return w.step?.definition.operationKey && (!w.execution || w.resultStale)
    ? '请先运行当前配置，确认结果后再继续。'
    : null;
}
async function submit() {
  if (!state.value || !checkpoint.value || locked.value || exhausted.value) return;
  attention.clear();
  if (submitted.value && !answerChanged.value) return locate('这份内容已经提交。修改回答后再提交，或点击「完成此步骤」继续。');
  if (isTransferStep.value && String(w.answer.transfer || '').trim() === '')
    return locate('请写下你对新情境的想法，或明确选择这次不作答。', 'transfer');
  const issue = answerIssue(w.step?.definition.inputSchema, w.answer);
  if (issue) return locate(issue.message, issue.field);
  const calculation = executionIssue();
  if (calculation) return locate(calculation, 'execution');

  const issued = epoch;
  busy.value = true;
  try {
    if (!(await w.flush())) {
      if (issued === epoch) await locate(w.error || '保存尚未完成，输入已保留。');
      return;
    }
    if (issued !== epoch || !state.value || !checkpoint.value || !w.step || w.readOnly) return;
    state.value = await request<State>('/events', {
      expectedSequence: state.value.sequence,
      stepKey: w.selectedStep,
      expectedStepRevision: w.step.revision,
      kind: 'ATTEMPT_SUBMITTED',
      checkpointId: checkpoint.value.checkpointId,
      role: isTransferStep.value ? 'TRANSFER' : attempts.value.length ? 'REVISION' : 'INITIAL',
    });
    error.value = '';
  } catch (e) {
    if (issued === epoch) {
      error.value = errorText(e);
      await locate(error.value);
    }
  } finally {
    if (issued === epoch) busy.value = false;
  }
}
async function check(assistance=false){if(locked.value)return;attention.clear();if(!assistance){const schema=w.step?.definition.inputSchema.properties.local as InputSchema;const issue=answerIssue(schema,local.value);if(issue)return locate(issue.message,'local.'+issue.field);}if(!(await w.flush()))return locate(w.error||'先保存当前填写，数据不会被丢弃。');const issued=epoch;busy.value=true;try{const result=await request<{record:LocalRecord}>('/local-results',{stepKey:w.selectedStep,expectedStepRevision:w.step!.revision,assistance});if(assistance&&result.record.calculated){editLocal('values',result.record.calculated);await locate('这些数值由网站计算并填入，帮助记录会保留。请写你自己的理解，然后点击核对并保存。','local.reason');}state.value=await request<State>('');error.value='';if(!assistance&&result.record.result?.status==='MISMATCHED'){const field=result.record.result.checks.find(c=>!c.matched);await locate('这个数值与按你所选规则计算的结果不同。请先检查范围和单位；原来的填写仍保留。','local.values.'+field?.field);}}catch(e){if(issued===epoch){error.value=errorText(e);await locate(error.value,'local.check');}}finally{if(issued===epoch)busy.value=false;}}
async function restoreSubmitted() {
  const savedAnswer = submitted.value?.payload.answer;
  if (!savedAnswer || locked.value) return;
  const issued = epoch;
  busy.value = true;
  try {
    w.edit(JSON.parse(JSON.stringify(savedAnswer)));
    const saved = await w.flush();
    if (issued !== epoch) return;
    if (!saved) {
      await locate(w.error || '恢复后的草稿尚未同步，请重试保存。');
      return;
    }
    error.value = '';
    const calculation = executionIssue();
    if (calculation) await locate('已恢复并保存原先提交的内容。' + calculation, 'execution');
    else await locate('已恢复并保存原先提交的内容。点击「完成此步骤」继续。');
  } finally {
    if (issued === epoch) busy.value = false;
  }
}
async function continueWithSupport(){if(!state.value||!checkpoint.value||locked.value)return;busy.value=true;const issued=epoch;try{state.value=await request<State>('/events',{expectedSequence:state.value.sequence,stepKey:w.selectedStep,kind:'CONTINUE_WITH_SUPPORT',checkpointId:checkpoint.value.checkpointId});error.value='';}catch(e){if(issued===epoch){error.value=errorText(e);await locate(error.value);}}finally{if(issued===epoch)busy.value=false;}}
async function ready() {
  if (busy.value) return false;
  if (!selected.value) {
    await locate(error.value || '正在读取学习记录，请稍候。');
    return false;
  }
  if (needsRestore.value) {
    await locate('当前草稿与已提交的回答不同。请点击「恢复上次提交」后继续。');
    return false;
  }
  const calculation = executionIssue();
  if (calculation) { await locate(calculation, 'execution'); return false; }
  if (selected.value.local && !lastCheck.value) {
    await locate('先点击「核对并保存」，你的原值会被保留。', 'local.check');
    return false;
  }
  if (isTransferStep.value && !submittedTransfer.value && w.answer.transferMode === 'SKIP') return true;
  if (checkpoint.value && (!submitted.value || answerChanged.value)) {
    await locate('请先明确提交这一小步；自动保存的草稿不会当作学习过程记录。');
    return false;
  }
  return true;
}
defineExpose({ready});
</script>
<template>
  <div ref="region" class="guided-workspace" data-field-path="learning" tabindex="-1">
    <p v-if="error" class="error-notice" role="alert">{{error}} <button class="text-link plain-button" @click="load">重新读取记录</button></p>
    <p v-if="!state&&!error">正在读取这一版方法路线…</p>
    <template v-if="selected&&state">
      <p class="method-eyebrow">方法路线 · {{state.guide.methodName}}</p>
      <p class="method-reading-note">先说出你的想法，不需要专业术语。不确定也可以写出来。</p>
      <ClassifierConfig :hide-rationale="true" v-if="w.selectedStep==='a4-configure'&&w.model&&w.step" :model="w.model" :schema="{...w.step.definition.inputSchema,properties:Object.fromEntries(Object.entries(w.step.definition.inputSchema.properties).filter(([k])=>!selected!.fields.some(f=>f.key===k)))}" :model-value="w.answer" :disabled="locked" @update:model-value="w.edit"/>
      <section v-if="w.step?.definition.operationKey" data-field-path="execution" class="method-execution">
        <button class="workspace-outline" :disabled="locked||w.executing" @click="emit('execute')">{{w.executing?'正在核对模型结果…':'运行当前配置并比较'}}</button>
        <p v-if="w.resultStale" role="status">答案或模型配置已更新，请重新运行以核对当前结果。</p>
        <p v-if="w.executionError" role="alert">{{w.executionError}}</p>
        <ClassifierMetrics :value="w.comparison" :baseline="w.baseline"/>
      </section>
      <section v-if="selected.local" class="local-return" data-field-path="local">
        <h2>把本地结果带回来</h2><p>网页不会读取你的Excel。只填写下面这些结果；也可以使用网站计算帮助。</p>
        <label data-field-path="local.workbookVersion">我使用的工作簿版本<input :disabled="inputLocked" :value="local.workbookVersion" @input="editLocal('workbookVersion',($event.target as HTMLInputElement).value)"/><small>当前下载文件为 {{state.workbooks[0]?.workbookVersion}}。任务版本与文件版本可以不同。</small></label>
        <label>我采用的方法<select :disabled="inputLocked" :value="local.method" @change="editLocal('method',($event.target as HTMLSelectElement).value)"><option value="SUPPORTED">按下面的规则处理（网站可复算）</option><option value="OTHER">其他方法（保留说明，暂不复算）</option></select></label>
        <details :open="true"><summary>本次计算范围与规则</summary><div class="method-fields">
          <template v-for="(property,key) in selected.local.specificationSchema.properties" :key="key">
            <label v-if="!['resultSet','missingDaysPolicy'].includes(String(key))" :data-field-path="'local.specification.'+key">{{labels[String(key)]||key}}
              <select v-if="property.enum" :disabled="inputLocked" :value="local.specification?.[key]" @change="spec(String(key),($event.target as HTMLSelectElement).value)"><option v-for="value in property.enum" :key="String(value)" :value="value">{{choices[String(value)]||value}}</option></select>
              <input v-else-if="property.type==='array'" :disabled="inputLocked" :value="(local.specification?.[key] as string[]||[]).join(', ')" @input="spec(String(key),($event.target as HTMLInputElement).value.split(/[,，\s]+/).filter(Boolean))"/>
              <input v-else type="number" :min="property.minimum" :max="property.maximum" :disabled="inputLocked" :value="local.specification?.[key]" @input="spec(String(key),Number(($event.target as HTMLInputElement).value))"/>
            </label>
          </template>
        </div></details>
        <div class="method-fields"><label v-for="key in selected.local.valueKeys" :key="key" :data-field-path="'local.values.'+key">{{metricLabel(key)}}<input inputmode="decimal" :disabled="inputLocked" :value="local.values?.[key]" placeholder="分母为0时填写 UNDEFINED" @input="editLocal('values',{...local.values,[key]:($event.target as HTMLInputElement).value})"/></label></div>
        <label data-field-path="local.reason">你怎样处理和计算的？<textarea :disabled="inputLocked" rows="3" maxlength="1600" :value="local.reason" @input="editLocal('reason',($event.target as HTMLTextAreaElement).value)"/></label>
        <div class="method-actions" data-field-path="local.check"><button class="workspace-outline" :disabled="locked" @click="check(false)">核对并保存</button><button class="text-link plain-button" :disabled="inputLocked" @click="check(true)">需要网站帮我计算</button></div>
        <p v-if="lastCheck?.result" class="method-check" role="status">{{statusNames[lastCheck.result.status]}}<small>核对一致只说明数值相符，不证明本地Excel操作过程。</small></p>
        <details v-if="lastCheck?.result?.checks?.length"><summary>查看各项核对</summary><p v-for="c in lastCheck.result.checks" :key="c.field">{{metricLabel(c.field)}}：{{c.matched?'一致':'不同'}} · 按你的填写精度复算 {{c.expectedAtEnteredPrecision??'无法计算'}}</p></details>
      </section>
      <div class="guided-answers"><label v-for="field in selected.fields.filter(f=>f.key!=='transfer'||w.answer.transferMode!=='SKIP')" :key="field.key" :data-field-path="field.key"><strong>{{field.label}}</strong><small v-if="field.help">{{field.help}}</small><select v-if="field.options" :disabled="inputLocked" :value="w.answer[field.key]" @change="edit(field.key,($event.target as HTMLSelectElement).value)"><option value="" disabled>请选择</option><option v-for="(label,key) in field.options" :key="key" :value="key">{{label}}</option></select><textarea v-else :disabled="inputLocked" rows="4" maxlength="1600" :name="field.key" :value="w.answer[field.key] as string" @input="edit(field.key,($event.target as HTMLTextAreaElement).value)"/></label></div>
      <section v-if="checkpoint&&(!isTransferStep||submittedTransfer||w.answer.transferMode!=='SKIP')" class="learning-submit" data-field-path="learning">
        <h2>{{selected.transferCheckpointId?'换个情境，再说说你的想法':'留下一次明确提交'}}</h2>
        <p v-if="isTransferStep">{{submittedTransfer ? '这道小题只提交一次。确认后点击「完成此步骤」。' : '可提交一次回答，也可以选择这次不作答。'}}</p>
        <p v-else-if="submittedTransfer">你已提交新情境题，本题的提交记录已保留。</p>
        <p v-else-if="attempts.length === 1 && !answerChanged">首次回答已保留。改动答案后可以再提交一次，也可以直接完成这一步。</p>
        <p v-else>自动保存只保存草稿。{{attempts.length?'每个检查点最多再修改提交一次。':'先提交自己的想法，之后可以查看提示，再修改一次。'}}</p>
        <p v-if="needsRestore" role="status">恢复会以正式提交的答案替换本步骤草稿。</p>
        <button v-if="needsRestore" class="workspace-outline" :disabled="locked" data-attention-control @click="restoreSubmitted">恢复上次提交</button>
        <button class="workspace-outline" :disabled="locked||exhausted||w.executing||!!(submitted&&!answerChanged)" @click="submit">{{submitLabel}}</button>
        <button v-if="attempts.length&&!selected.transferCheckpointId&&state.events.some(e=>e.checkpointId===checkpoint?.checkpointId&&e.payload.supportId&&!e.payload.supportId.endsWith('-basic'))&&!state.events.some(e=>e.kind==='CONTINUE_WITH_SUPPORT'&&e.checkpointId===checkpoint?.checkpointId)" class="text-link plain-button" :disabled="locked" @click="continueWithSupport">还没有完全理解，带着已有帮助继续</button>
        <p v-if="submittedHere.length" role="status">已记录 {{submittedHere.length}} 次提交。概念不确定也可以保留回答继续；答错不会锁住流程。</p>
        <details v-for="s in checkpoint.supports.filter(s=>s.kind!=='BASIC')" :key="s.supportId" class="method-support"><summary>{{s.kind==='RECOVERY'?'需要一个中间说明，帮助我继续':s.kind.replace('HINT_','提示 ')}}</summary>
          <template v-if="state.events.some(e=>e.payload.supportId===s.supportId)"><p>{{s.text}}</p><small>这份帮助已提供；不代表你已阅读或理解。</small></template>
          <button v-else class="text-link plain-button" :disabled="locked||(s.kind==='RECOVERY'&&!attempts.length)" @click="support(s)">{{s.kind==='RECOVERY'?'使用系统中间说明':'查看这份提示'}}</button>
        </details>
        <details v-if="submittedHere.length"><summary>查看已提交的原话</summary><div v-for="a in submittedHere" :key="a.sequence"><h3>{{a.payload.role==='TRANSFER'?'新情境提交':a.payload.role==='INITIAL'?'初次提交':'修订提交'}}</h3><p v-for="f in selected.fields" :key="f.key">{{f.label}}：{{a.payload.answer?.[f.key]}}</p></div></details>
      </section>
    </template>
  </div>
</template>
<style scoped>
.guided-workspace{max-width:800px}.method-eyebrow{font-size:.8rem;letter-spacing:.06em;color:var(--accent,#304ffe)}.method-reading-note{font-size:1.1rem;line-height:1.8}.guided-answers{display:grid;gap:2rem;margin:2.4rem 0}.guided-workspace label{display:grid;gap:.6rem;line-height:1.6}.guided-workspace small{display:block;color:#6d7179;font-size:.85rem;line-height:1.7}.guided-workspace input,.guided-workspace select,.guided-workspace textarea{width:100%;box-sizing:border-box;border:1px solid #9c9d98;background:#fffdf8;color:#191d20;padding:.8rem;font:inherit;border-radius:2px}.guided-workspace :is(input,select,textarea,summary,button):focus-visible{outline:2px solid #304ffe;outline-offset:4px}.guided-workspace textarea{resize:vertical}.method-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.2rem;margin:1.5rem 0}.local-return,.learning-submit{border-top:1px solid #aaa99e;padding-top:2rem;margin-top:2rem}.local-return>label{margin:1.4rem 0}.method-actions{display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap}.method-check{padding:1rem 0;border-block:1px solid #aaa99e}.method-support{border-bottom:1px solid #c9c7bd;padding:1rem 0}.guided-workspace summary{cursor:pointer;line-height:1.7}.method-support p{white-space:pre-wrap;line-height:1.9}.method-execution{padding:1rem 0}@media(max-width:640px){.method-fields{grid-template-columns:1fr}.method-actions{align-items:flex-start;flex-direction:column}.guided-workspace textarea{font-size:16px}}
</style>
