<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, ApiError, errorText, stableOperation } from "../lib/api";
import { useAuth, identityRequest, onIdentityChange } from "../stores/auth";
import type { PilotStatus } from "../lib/pilot";
import type { Answers, Field, Questionnaire } from "../types";
import QuestionField from "../components/QuestionField.vue";
import ArrowIcon from "../components/ArrowIcon.vue";

const auth = useAuth(), router = useRouter(), operation = stableOperation();
const status = ref<PilotStatus | null>(null), definition = ref<Questionnaire | null>(null);
const answers = ref<Answers>({}), step = ref(0), busy = ref(false), error = ref("");
const terms = ref(false), privacy = ref(false), research = ref(false), showErrors = ref(false);
const content = ref<HTMLElement | null>(null), heading = ref<HTMLElement | null>(null);
const page = computed(() => definition.value?.pages[step.value]);
let draftKey = "";
const unsubscribe = onIdentityChange(() => { if(draftKey)try{sessionStorage.removeItem(draftKey);}catch{/* Storage may be unavailable. */}draftKey="";answers.value={};status.value=null; });
onBeforeUnmount(unsubscribe);
watch([answers, step], () => { if(draftKey)try{sessionStorage.setItem(draftKey,JSON.stringify({answers:answers.value,step:step.value}));}catch{/* Server submission remains available. */} }, {deep:true});
function problem(field: Field) {
  const value=answers.value[field.key];
  if(field.type==="TEXT")return typeof value==="string"&&[...value].length>(field.maxLength||300)?"内容太长，请缩短一些。":"";
  if(!field.required)return "";
  if(field.type==="SINGLE")return value?"":"请选择一项。";
  if(field.type==="MULTIPLE")return Array.isArray(value)&&value.length>=(field.minItems||1)?"":"请至少选择一项。";
  if(field.type==="MATRIX")return value&&!Array.isArray(value)&&typeof value==="object"&&field.rows.every(row=>value[row.code])?"":"请为每一项选择当前情况。";
  if(field.type==="RANKING")return Array.isArray(value)&&value.length===3?"":"请设置三种情境的顺序，也可以并列。";
  return "";
}
async function focusProblem() {
  await nextTick();
  const field=content.value?.querySelector<HTMLElement>(".field-error")?.closest<HTMLElement>(".question-field");
  const target=field?.querySelector<HTMLElement>("input,select,textarea,button")||content.value?.querySelector<HTMLElement>(".error-notice")||heading.value;
  target?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});
  target?.focus({preventScroll:true});
  if(!matchMedia("(prefers-reduced-motion: reduce)").matches)target?.animate([{outline:"3px solid #4b50ff"},{outline:"3px solid transparent"}],{duration:1200,iterations:2});
}
async function load() {
  const ticket=identityRequest();busy.value=true;error.value="";
  try{
    const loaded=await api<PilotStatus>("/api/app/v1/pilot",{signal:ticket.signal});ticket.assertCurrent();status.value=loaded;
    if(loaded.consented){
      const profiles=await api<unknown[]>("/api/app/v1/decision-profiles",{signal:ticket.signal});ticket.assertCurrent();
      if(profiles.length){await router.replace("/app");return;}
    }
    const questions=await api<Questionnaire>("/api/public/v1/questionnaires/current",{signal:ticket.signal});ticket.assertCurrent();definition.value=questions;
    draftKey=`mp:pilot-intake:${auth.me!.studentId}`;
    try{const cached=JSON.parse(sessionStorage.getItem(draftKey)||"null");if(cached?.answers&&Number.isInteger(cached.step)&&cached.step>=0&&cached.step<questions.pages.length){answers.value=cached.answers;step.value=cached.step;}}catch{/* Ignore corrupt draft. */}
  }catch(cause){if(ticket.current())error.value=errorText(cause);}finally{if(ticket.current())busy.value=false;ticket.finish();}
}
async function accept() {
  if(!terms.value||!privacy.value)return;
  const ticket=identityRequest();busy.value=true;error.value="";
  try{
    const result=await api<PilotStatus>("/api/app/v1/pilot/consent",{method:"POST",signal:ticket.signal,body:{consents:[{documentType:"TERMS",documentVersion:"pilot-v1",decision:"ACCEPTED"},{documentType:"PRIVACY",documentVersion:"pilot-v1",decision:"ACCEPTED"},{documentType:"RESEARCH",documentVersion:"pilot-v1",decision:research.value?"ACCEPTED":"DECLINED"}]}});ticket.assertCurrent();status.value=result;await auth.refresh(true);
  }catch(cause){if(ticket.current())error.value=errorText(cause);}finally{if(ticket.current())busy.value=false;ticket.finish();}
}
async function advance() {
  showErrors.value=true;error.value="";
  if(page.value?.fields.some(field=>problem(field))){await focusProblem();return;}
  if(step.value<(definition.value?.pages.length||0)-1){step.value++;showErrors.value=false;await nextTick();heading.value?.focus();return;}
  const missing=definition.value!.pages.findIndex(item=>item.fields.some(field=>problem(field)));
  if(missing>=0){step.value=missing;await focusProblem();return;}
  const ticket=identityRequest();busy.value=true;
  try{
    const body={questionnaireVersion:definition.value!.questionnaireVersion,answers:answers.value};
    await api("/api/app/v1/decision-profiles",{method:"POST",signal:ticket.signal,body,key:operation(body)});ticket.assertCurrent();
    try{sessionStorage.removeItem(draftKey);}catch{/* Submission is already saved. */}draftKey="";await router.replace("/app");
  }catch(cause){if(ticket.current()){error.value=errorText(cause);if(cause instanceof ApiError&&cause.fields?.length){const key=cause.fields[0]?.field;const index=definition.value!.pages.findIndex(item=>item.fields.some(field=>field.key===key));if(index>=0)step.value=index;}await focusProblem();}}finally{if(ticket.current())busy.value=false;ticket.finish();}
}
onMounted(load);
</script>

<template>
  <main class="pilot-welcome" ref="content">
    <RouterLink to="/" class="page-back">← MajorPilot</RouterLink>
    <p class="eyebrow">A SMALL INVITATION, A REAL EXPLORATION</p>
    <h1 class="serif">先说说你的起点。</h1>
    <p class="pilot-lead">这里不是考试。你可以不了解这个专业，也可以在体验中发现自己暂时没弄懂的地方。</p>
    <p v-if="error" class="error-notice" role="alert" tabindex="-1">{{ error }} <button v-if="!status" class="text-link" @click="load">重新读取</button></p>
    <p v-if="!status && busy" role="status">正在读取测试账户…</p>
    <form v-else-if="status && !status.consented" class="pilot-card" @submit.prevent="accept">
      <h2>开始之前，由你决定。</h2>
      <p>这是邀请测试版：每个账户可生成 3 次单专业报告、2 次比较报告。阅读已有报告不占次数。模型请求发出后若失败，这次仍会计入额度；作答会保留。</p>
      <div class="consent-list">
        <label><input v-model="terms" type="checkbox" required /><span>我已阅读并同意<RouterLink to="/terms" target="_blank">使用条款（pilot-v1）</RouterLink>。</span></label>
        <label><input v-model="privacy" type="checkbox" required /><span>我已阅读并同意<RouterLink to="/privacy" target="_blank">隐私说明（pilot-v1）</RouterLink>，了解报告生成需要将本次作答交给 AI 服务处理。</span></label>
        <label><input v-model="research" type="checkbox" /><span>可选：同意将去标识化的体验资料用于产品研究。拒绝不影响体验，之后可以撤回。</span></label>
      </div>
      <button class="primary-button" :disabled="busy"><span>{{ busy?'正在保存…':'确认，继续了解我的起点' }}</span><span class="action-arrow"><ArrowIcon /></span></button>
    </form>
    <form v-else-if="status?.consented && page" class="pilot-card" @submit.prevent="advance">
      <div class="pilot-step"><span>背景了解 · {{ step+1 }} / {{ definition!.pages.length }}</span><span>{{page.required?'需要回答':'可跳过'}}</span></div>
      <h2 ref="heading" tabindex="-1">{{ page.title }}</h2><p>{{ page.why }}</p>
      <QuestionField v-for="field in page.fields" :key="field.key" :field="field" v-model="answers[field.key]" :error="showErrors?problem(field):''" />
      <div class="intake-controls"><button v-if="step>0" type="button" class="quiet-button" :disabled="busy" @click="step--;showErrors=false">上一步</button><button class="primary-button" :disabled="busy"><span>{{busy?'正在保存…':step===definition!.pages.length-1?'查看我的初始建议':'继续'}}</span><span class="action-arrow"><ArrowIcon /></span></button></div>
      <p class="field-help">未提交的回答只暂存在当前浏览器标签页；退出账户会清除。最后提交后，回答和建议才会保存到账户。</p>
    </form>
  </main>
</template>
<style scoped>
.pilot-welcome{max-width:860px;margin:0 auto;padding:48px 24px 96px}.eyebrow{margin-top:60px}.pilot-welcome h1{font-size:clamp(40px,7vw,72px);margin:18px 0}.pilot-lead{font-size:20px;line-height:1.8;max-width:650px}.pilot-card{margin-top:40px;padding-top:32px;border-top:1px solid var(--ink,#232629);line-height:1.8}.pilot-step{display:flex;justify-content:space-between;color:#636775;font-size:14px}.pilot-card h2{font-size:28px}.pilot-card .consent-list{margin:28px 0}.intake-controls{margin:32px 0 20px}.pilot-card .field-help{font-size:13px}.pilot-card :deep(input[type=checkbox]){flex-shrink:0}
</style>
