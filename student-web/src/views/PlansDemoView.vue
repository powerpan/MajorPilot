<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import ArrowIcon from "../components/ArrowIcon.vue";

type Stage = "PLANS" | "REVIEW" | "CONFIRMED" | "ENDED";
const stage = ref<Stage>("PLANS");
const stageHeading = ref<HTMLElement | null>(null);
const stageNames: Record<Stage, string> = {
  PLANS: "先了解可能的方案",
  REVIEW: "查看支付演示",
  CONFIRMED: "演示已确认，还没有任何交易",
  ENDED: "演示结束，未产生订单或费用",
};
const title = computed(() => stageNames[stage.value]);
const steps = ["方案说明", "查看演示", "确认演示", "结束演示"];
const stageIndex = computed(() => ["PLANS", "REVIEW", "CONFIRMED", "ENDED"].indexOf(stage.value));

// Deliberately local and ephemeral: no order, payment, profile, task or allowance API.
async function advance(expected: Stage, next: Stage) {
  if (stage.value !== expected) return;
  stage.value = next;
  await nextTick();
  stageHeading.value?.focus({ preventScroll: true });
  stageHeading.value?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
}
</script>

<template>
  <main class="plans-page">
    <RouterLink to="/app" class="text-link">← 返回个人主页</RouterLink>
    <header class="plans-header">
      <p class="eyebrow">PREVIEW ONLY</p>
      <h1 class="serif">方案与支付<span>（演示）</span></h1>
      <p class="plans-intro">看看未来可能怎样提供服务。现在只演示流程，不进行交易。</p>
    </header>

    <aside class="demo-boundary" aria-label="支付演示说明">
      <strong>这是演示，不是真实支付。</strong>
      <p>不会扣款、不会创建真实订单、不会增加或消耗报告额度。</p>
      <p>无需填写银行卡或任何付款信息。当前邀请测试额度与本页无关，不构成正式付费权益。</p>
    </aside>

    <ol class="demo-steps" aria-label="演示步骤">
      <li v-for="(label, index) in steps" :key="label" :aria-current="stageIndex === index ? 'step' : undefined" :class="{ current: stageIndex === index }">
        <span>{{ String(index + 1).padStart(2, '0') }}</span>{{ label }}
      </li>
    </ol>

    <section class="plans-content" :data-stage="stage">
      <div class="plans-copy">
        <h2 ref="stageHeading" tabindex="-1" class="serif">{{ title }}</h2>
        <template v-if="stage === 'PLANS'">
          <p>未来的方案可能包含以下现有服务，具体组合尚未确定：</p>
          <ul class="possible-services">
            <li><h3>专业任务式体验</h3><p>在 AI、Data Science 或 Business Analytics 的任务中了解工作方式。</p></li>
            <li><h3>单专业体验报告</h3><p>回顾已完成任务中的操作、回答与体验感受。</p></li>
            <li><h3>专业比较报告</h3><p>结合已完成的不同专业体验，理解它们之间的差异。</p></li>
          </ul>
          <p class="muted">这里只说明可能的服务内容，不代表已推出套餐，也没有购买承诺。</p>
        </template>
        <template v-else-if="stage === 'REVIEW'">
          <p>这一步展示确认流程的位置。正式方案与费用还未确定，没有支付方式可选，也没有付款资料需要填写。</p>
          <p>点击“确认演示”只会进入下一个演示画面，不会提交订单。</p>
        </template>
        <template v-else-if="stage === 'CONFIRMED'">
          <p>你已走到演示的最后一步。这里不会连接收款服务，也不会生成订单编号、收据或支付成功凭证。</p>
          <p>结束演示后，可以返回个人主页继续原来的专业探索。</p>
        </template>
        <template v-else>
          <p role="status">你的账户、报告额度和体验进度都没有因本次演示而改变。</p>
          <p>之后的方案与费用确定后，会另行说明。</p>
        </template>
      </div>

      <aside class="fee-preview" aria-labelledby="fee-title">
        <p class="eyebrow">NOT AN ORDER</p>
        <h2 id="fee-title">费用区域</h2>
        <dl><div v-for="label in ['方案', '价格', '币种', '包含次数', '有效期']" :key="label"><dt>{{ label }}</dt><dd>待定</dd></div></dl>
        <p>未定价 · 不收款 · 无付费权益变更</p>
      </aside>
    </section>

    <div class="plans-actions">
      <button v-if="stage === 'PLANS'" class="action-link action-small" @click="advance('PLANS', 'REVIEW')"><span>查看支付演示</span><span class="action-arrow"><ArrowIcon /></span></button>
      <button v-else-if="stage === 'REVIEW'" class="action-link action-small" @click="advance('REVIEW', 'CONFIRMED')"><span>确认演示</span><span class="action-arrow"><ArrowIcon /></span></button>
      <button v-else-if="stage === 'CONFIRMED'" class="action-link action-small" @click="advance('CONFIRMED', 'ENDED')"><span>结束演示</span><span class="action-arrow"><ArrowIcon /></span></button>
      <RouterLink v-else to="/app" class="action-link action-small"><span>返回个人主页</span><span class="action-arrow"><ArrowIcon /></span></RouterLink>
      <RouterLink v-if="stage !== 'ENDED'" to="/app" class="text-link">退出演示，返回主页</RouterLink>
      <button v-else class="plain-button text-link" @click="advance('ENDED', 'PLANS')">再看一次演示</button>
    </div>
  </main>
</template>

<style scoped>
.plans-page { max-width: 1120px; margin: auto; padding: 40px 40px 90px; }
.plans-header { padding: 44px 0 30px; }
.eyebrow { font-size: 11px; letter-spacing: .16em; margin-bottom: 12px; }
.plans-header h1 { font-size: clamp(32px, 4vw, 52px); font-weight: 500; margin: 0 0 18px; }
.plans-header h1 span { font-size: .6em; white-space: nowrap; }
.plans-intro { color: var(--muted); line-height: 1.8; }
.demo-boundary { border-top: 1px solid var(--ink); border-bottom: 1px solid var(--line); padding: 20px 0; }
.demo-boundary strong { font-size: 18px; }
.demo-boundary p { margin: 10px 0 0; line-height: 1.8; font-size: 14px; }
.demo-steps { display: grid; grid-template-columns: repeat(4, 1fr); list-style: none; padding: 0; margin: 30px 0 40px; gap: 20px; }
.demo-steps li { border-top: 2px solid var(--line); padding: 12px 0; color: var(--muted); font-size: 13px; }
.demo-steps span { margin-right: 12px; font-variant-numeric: tabular-nums; }
.demo-steps .current { color: var(--blue); border-color: var(--blue); }
.plans-content { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 60px; }
.plans-copy h2 { font-size: 29px; font-weight: 500; line-height: 1.4; margin: 0 0 20px; }
.plans-copy h2:focus { outline: none; }
.plans-copy p { font-size: 15px; line-height: 1.9; }
.possible-services { list-style: none; padding: 0; margin: 26px 0; }
.possible-services li { padding: 14px 0; border-bottom: 1px solid var(--line); }
.possible-services h3 { font-size: 17px; margin: 0 0 6px; }
.possible-services p { margin: 0; color: var(--muted); font-size: 14px; }
.fee-preview { border-left: 1px solid var(--line); padding-left: 30px; }
.fee-preview h2 { font-size: 22px; margin: 0 0 24px; }
.fee-preview dl { margin: 0; }
.fee-preview dl > div { display: flex; justify-content: space-between; gap: 20px; padding: 14px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.fee-preview dd { margin: 0; }
.fee-preview > p:last-child { font-size: 12px; line-height: 1.7; color: var(--muted); }
.plans-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 28px; margin-top: 36px; }
.plans-actions > .text-link { font-size: 14px; }
@media (max-width: 700px) {
  .plans-page { padding: 28px 6% 60px; }
  .plans-header { padding-top: 32px; }
  .demo-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; margin: 24px 0; }
  .plans-content { grid-template-columns: 1fr; gap: 32px; }
  .plans-copy h2 { font-size: 27px; }
  .fee-preview { padding: 24px 0 0; border-left: 0; border-top: 1px solid var(--line); }
  .plans-actions { align-items: flex-start; flex-direction: column; }
  .plans-actions > .action-link { width: 100%; justify-content: space-between; font-size: 18px; }
}
</style>
