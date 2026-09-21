<script setup lang="ts">
import { computed } from "vue";
import type { Answer, InputSchema } from "../../types/workspace";
import type {
  BaActionContext,
  SegmentBy,
} from "../../../../shared/ba/ba-metrics-v1.mjs";
import {
  baLabel,
  changeSegment,
  segmentOptions,
  actionBaseline,
  rateText,
  baNumber,
  supportText,
  actionIssue,
} from "../../lib/ba-display";
import BaField from "./BaField.vue";
const props = defineProps<{
  stepKey: string;
  schema: InputSchema;
  modelValue: Answer;
  disabled: boolean;
  context?: BaActionContext;
  contextStale: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Answer] }>();
function set(key: string, value: unknown) {
  const next = { ...props.modelValue };
  if (value === undefined) delete next[key];
  else next[key] = value;
  emit("update:modelValue", next);
}
function toggle(option: string) {
  const current = (props.modelValue.outOfScope || []) as string[];
  set(
    "outOfScope",
    current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option],
  );
}
const baseline = computed(() =>
  props.contextStale
    ? null
    : actionBaseline(props.context, props.modelValue.successMetric),
);
const target = computed(() =>
  baseline.value &&
  typeof props.modelValue.targetChangePercentagePoints === "number"
    ? baseline.value.rate * 100 + props.modelValue.targetChangePercentagePoints
    : null,
);
const successOptions = computed(() =>
  props.schema.properties.successMetric?.enum?.filter(
    (value) =>
      value !== "STARTER_COMPLETION_RATE" ||
      props.context?.parameters.denominator === "first_lesson_count",
  ),
);
const texts: Record<string, string> = {
  businessQuestion: "本次要回答的业务问题",
  decisionScope: "本次可以决定的范围",
  metricReason: "为什么采用这个口径？",
  focusReason: "为什么优先这个环节？",
  priorityReason: "为什么优先这个群体？",
  observation: "观测：数据直接说明了什么？",
  hypothesis: "可能原因：你的假设",
  unknownInformation: "尚缺信息：还需要知道什么？",
  actionDescription: "行动描述",
  actionReason: "选择依据",
  testPlan: "小范围验证计划",
};
const field = (key: string) => ({
  name: key,
  label: texts[key] || key,
  value: props.modelValue[key],
  schema: props.schema.properties[key],
  disabled: props.disabled,
});
</script>
<template>
  <div class="ba-fields">
    <template v-if="stepKey === 'b1-context'">
      <label class="workspace-check"
        ><input
          type="checkbox"
          name="acknowledged"
          :checked="modelValue.acknowledged === true"
          :disabled="disabled"
          @change="
            set('acknowledged', ($event.target as HTMLInputElement).checked)
          "
        />我已阅读业务情境与数据边界</label
      >
      <BaField
        v-for="key in ['businessQuestion', 'decisionScope']"
        :key="key"
        v-bind="field(key)"
        @change="set(key, $event)"
      />
      <fieldset class="ba-radio" :disabled="disabled">
        <legend>当前数据无法回答的事项</legend>
        <label
          v-for="option in schema.properties.outOfScope?.items?.enum"
          :key="option"
          ><input
            type="checkbox"
            name="outOfScope"
            :value="option"
            :checked="
              ((modelValue.outOfScope || []) as string[]).includes(
                String(option),
              )
            "
            @change="toggle(String(option))"
          />{{ baLabel(option) }}</label
        >
      </fieldset>
    </template>
    <template v-if="stepKey === 'b2-metric'">
      <div class="ba-columns">
        <BaField
          v-bind="field('numerator')"
          label="分子（完成的事件）"
          kind="select"
          @change="set('numerator', $event)"
        /><BaField
          v-bind="field('denominator')"
          label="分母（参与的总体）"
          kind="select"
          @change="set('denominator', $event)"
        />
      </div>
      <div class="ba-columns ba-windows">
        <section v-for="period in ['baseline', 'comparison']" :key="period">
          <h3>{{ period === "baseline" ? "基准批次" : "对比批次" }}</h3>
          <div class="ba-columns">
            <BaField
              v-for="edge in ['Start', 'End']"
              :key="edge"
              v-bind="field(period + edge + 'Week')"
              :label="edge === 'Start' ? '开始周' : '结束周'"
              kind="number"
              @change="set(period + edge + 'Week', $event)"
            />
          </div>
        </section>
      </div>
      <slot name="analysis" />
      <BaField
        v-bind="field('metricReason')"
        @change="set('metricReason', $event)"
      />
    </template>
    <template v-if="stepKey === 'b3-funnel'">
      <slot name="analysis" />
      <div class="ba-columns">
        <BaField
          v-bind="field('focusTransitionKey')"
          label="优先查看的环节"
          kind="select"
          @change="set('focusTransitionKey', $event)"
        /><BaField
          v-bind="field('focusReason')"
          @change="set('focusReason', $event)"
        />
      </div>
    </template>
    <template v-if="stepKey === 'b4-segment'">
      <BaField
        v-bind="field('segmentBy')"
        label="比较维度"
        kind="select"
        @change="
          emit(
            'update:modelValue',
            changeSegment(modelValue, $event as SegmentBy),
          )
        "
      />
      <slot name="analysis" />
      <div class="ba-columns">
        <BaField
          v-bind="field('prioritySegmentKey')"
          label="优先验证的群体"
          kind="select"
          :options="segmentOptions(modelValue.segmentBy)"
          @change="set('prioritySegmentKey', $event)"
        /><BaField
          v-bind="field('priorityReason')"
          @change="set('priorityReason', $event)"
        />
      </div>
    </template>
    <template v-if="stepKey === 'b5-hypothesis'">
      <BaField
        v-bind="field('observation')"
        @change="set('observation', $event)"
      /><BaField
        v-bind="field('evidenceStepKey')"
        label="引用的分析步骤"
        kind="select"
        @change="set('evidenceStepKey', $event)"
      />
      <BaField
        v-for="key in ['hypothesis', 'unknownInformation']"
        :key="key"
        v-bind="field(key)"
        @change="set(key, $event)"
      />
    </template>
    <template v-if="stepKey === 'b6-action'">
      <section class="ba-action-section">
        <h2>行动</h2>
        <BaField
          v-bind="field('actionKey')"
          label="选择行动方案"
          kind="select"
          @change="set('actionKey', $event)"
        /><BaField
          v-for="key in ['actionDescription', 'actionReason']"
          :key="key"
          v-bind="field(key)"
          @change="set(key, $event)"
        />
      </section>
      <BaField
        v-bind="field('targetSegmentKey')"
        label="确认目标群体（当前 B4 选择）"
        kind="select"
        :options="context && !contextStale ? [context.prioritySegmentKey] : []"
        @change="set('targetSegmentKey', $event)"
      />
      <div class="ba-columns">
        <BaField
          v-bind="field('successMetric')"
          label="成功指标"
          kind="select"
          :options="successOptions"
          @change="set('successMetric', $event)"
        /><BaField
          v-bind="field('targetChangePercentagePoints')"
          label="目标提升（百分点）"
          kind="number"
          @change="set('targetChangePercentagePoints', $event)"
        />
      </div>
      <p v-if="!contextStale" class="ba-baseline">
        {{
          baseline
            ? `所选群体对比期基线：${baseline.numerator} / ${baseline.denominator} = ${rateText(baseline.rate)}`
            : "尚无可计算基线；请先选择合法成功指标。"
        }}<br /><span v-if="target !== null"
          >基线＋学生期望提升：{{
            baNumber(target)
          }}%。这是试验目标，不是预测效果。</span
        >
      </p>
      <div class="ba-columns">
        <BaField
          v-bind="field('guardrailMetric')"
          label="护栏指标"
          kind="select"
          @change="set('guardrailMetric', $event)"
        /><BaField
          v-bind="field('guardrailMaximum')"
          label="可接受上限（次/100人）"
          kind="number"
          @change="set('guardrailMaximum', $event)"
        />
      </div>
      <p v-if="context && !contextStale" class="muted">
        当前所选群体对比期：{{
          supportText(context.comparison.supportContactsPer100Enrolled)
        }}（{{ context.comparison.supportContactCount }}次 /
        {{
          context.comparison.stageCounts.enrolled_count
        }}名报名者）。护栏可以更严格；低于当前值不证明能实现。
      </p>
      <BaField
        v-bind="field('reviewAfterDays')"
        label="复盘时间"
        kind="radio"
        @change="set('reviewAfterDays', $event)"
      />
      <p class="muted">
        从最后一名试验参与者入组日算起，28或42天后复盘。两者均只比较每人入组后的前28天；42天是晚14天复盘，不是累积42天。
      </p>
      <BaField v-bind="field('testPlan')" @change="set('testPlan', $event)" />
      <p
        v-if="
          context &&
          !contextStale &&
          modelValue.successMetric &&
          actionIssue(modelValue, context)
        "
        class="error-notice"
      >
        {{ actionIssue(modelValue, context) }}
      </p>
    </template>
  </div>
</template>
