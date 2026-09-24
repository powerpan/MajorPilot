<script setup lang="ts">
import type { Report } from '../../types/reports';
import { major } from '../../data/majors';
import { reportSelectionLabel } from '../../lib/report-display';
defineProps<{report:Report;printing?:boolean}>();
const status=(value:string)=>({SUPPORTED:'这段解释有依据',PARTIAL:'还差一个关键说明',NEEDS_REVISION:'这里有一处需要改正',INSUFFICIENT:'目前还看不出你的想法'}[value]||'回看这次回答');
const verification=(value:string)=>({MATCHED:'数值一致',MISMATCHED:'数值有差异',NOT_REPRODUCIBLE:'本地方法暂不能复算',VERSION_MISMATCH:'文件版本不同',NOT_CHECKED:'数值尚未确认'}[value]||'数值尚未确认');
</script>
<template>
  <template v-if="report.methodAnalysis">
    <section id="section-METHOD_OVERVIEW" class="report-section method-overview" tabindex="-1" aria-labelledby="method-overview-title">
      <h2 id="method-overview-title" class="serif"><span class="report-section-number">01</span>这次你做了什么</h2>
      <p class="method-summary">{{report.methodAnalysis.summary}}</p>
      <aside v-if="report.calculationConditions?.length" class="method-record-facts" aria-label="数值核对记录">
        <h3>这些数字核对了吗？</h3>
        <p>以下直接来自网站保存的记录，不由 AI 判断。阅读分析时，请以这里说明的核对范围为准。</p>
        <details v-for="(condition,i) in report.calculationConditions" :key="i" :open="printing||condition.verificationStatus!=='MATCHED'">
          <summary>{{major(condition.majorCode).name}} · {{condition.stepTitle}} · {{verification(condition.verificationStatus)}}</summary>
          <p>{{condition.description}}</p>
        </details>
      </aside>
      <div class="method-highlights"><article v-for="(point,i) in report.methodAnalysis.highlights" :key="i"><span class="method-kicker">值得带走 · {{i+1}}</span><h3>{{point.title}}</h3><p>{{point.explanation}}</p></article></div>
    </section>
    <section id="section-METHOD_PROCESS" class="report-section" tabindex="-1" aria-labelledby="method-process-title">
      <h2 id="method-process-title" class="serif"><span class="report-section-number">02</span>沿着过程回看</h2>
      <p class="method-note">这里说的是这一次回答。报告保留当时提供的帮助和你明确提交的修改；看不出来的地方会说清楚，不给能力打分。</p>
      <article v-for="node in report.methodAnalysis.nodes" :key="node.checkpointId" class="method-node">
        <header class="method-node-heading"><p class="method-kicker">{{major(node.majorCode).name}} · {{status(node.assessment)}}</p><h3>{{node.title}}</h3></header>
        <blockquote v-for="(quote,i) in node.quotes" :key="i"><small>{{quote.label}}<template v-if="reportSelectionLabel(node.majorCode,quote)">（所选项）</template></small><p>{{reportSelectionLabel(node.majorCode,quote) || quote.quote}}</p></blockquote>
        <p>{{node.reasoning}}</p>
        <div class="method-change"><h4>{{node.change.state==='COMPARED'?'前后有什么不同':'目前能看到的变化有限'}}</h4><p>{{node.change.explanation}}</p><p>{{node.dependency.explanation}}</p></div>
        <p v-if="node.supportConditions.length" class="method-note">当时的帮助：{{[...new Set(node.supportConditions)].join('；')}}。</p>
        <h4>下一次可以怎样做</h4><p>{{node.nextStep}}</p>
        <details v-if="node.example" :open="printing"><summary>看一个帮助理解的小例子</summary><p>{{node.example}}</p></details>
      </article>
      <details class="method-answer-details" :open="printing"><summary>逐条看看我的其他回答（{{report.methodAnalysis.answers.length}} 条）</summary><article v-for="(answer,i) in report.methodAnalysis.answers" :key="i" class="method-answer"><h3>{{answer.label}}</h3><blockquote>{{answer.answerQuote}}</blockquote><p>{{answer.explanation}}</p><p v-if="answer.nextStep"><strong>可以再试试：</strong>{{answer.nextStep}}</p></article></details>
    </section>
    <section id="section-METHOD_NEXT" class="report-section" tabindex="-1" aria-labelledby="method-next-title">
      <h2 id="method-next-title" class="serif"><span class="report-section-number">03</span>这与专业选择有什么关系</h2>
      <p>{{report.methodAnalysis.preference}}</p>
      <p v-for="(item,i) in report.methodAnalysis.comparison" :key="i">{{item.text}}</p>
      <article v-for="connection in report.professionConnections" :key="connection.majorCode"><h3>{{major(connection.majorCode).name}}：{{connection.methodName}}</h3><p>{{connection.scope}}</p></article>
      <slot name="next"/>
    </section>
  </template>
</template>
<style scoped>
.method-record-facts{border-block:1px solid #b8b6aa;padding:1.2rem 0;margin:1.8rem 0}.method-record-facts>p{color:#60656b;font-size:.9rem;line-height:1.8}.method-record-facts details{padding:.7rem 0}.method-record-facts details p{line-height:1.85;overflow-wrap:anywhere}
.method-summary{font-size:clamp(1.15rem,2vw,1.45rem);line-height:1.9;max-width:48rem}.method-highlights{border-top:1px solid var(--rule,#b8b6aa);margin:2rem 0}.method-highlights article{padding:1.5rem 0;border-bottom:1px solid var(--rule,#b8b6aa)}.method-kicker{color:var(--accent,#304ffe);font-size:.85rem;letter-spacing:.025em}.method-node{padding:2.5rem 0;border-bottom:1px solid #b8b6aa}.method-node h3{font-size:1.35rem}.method-node h4{font-size:1rem;margin:1.5rem 0 .5rem}.method-node p,.method-answer p{line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}.method-node blockquote,.method-answer blockquote{margin:1.5rem 0;padding:.4rem 0 .4rem 1.2rem;border-left:2px solid #3449f6;white-space:pre-wrap;overflow-wrap:anywhere}.method-node blockquote small{color:#696d74;font-size:.8rem}.method-node blockquote p{margin:.5rem 0}.method-note{font-size:.9rem;line-height:1.8;color:#60656b}.method-change{margin-top:1.4rem}.method-answer-details{margin:2rem 0}.method-answer{padding:1.5rem 0;border-bottom:1px solid #c9c7bd}summary{cursor:pointer;line-height:1.7}summary:focus-visible{outline:2px solid #3449f6;outline-offset:4px}@media print{.method-node{break-inside:auto}.method-node h3,.method-node h4{break-after:avoid}.method-highlights article{break-inside:avoid}.method-answer-details{display:block}}
@media print{
  .method-record-facts details{break-inside:avoid}.method-record-facts h3{break-after:avoid}
  .method-node-heading{break-inside:avoid;break-after:avoid}
  .method-node blockquote,.method-node details,.method-answer{break-inside:avoid}
  .method-node summary,.method-answer h3{break-after:avoid}
  .method-node p,.method-answer p{orphans:3;widows:3}
}
</style>
