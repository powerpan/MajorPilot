<script setup lang="ts">
import type {
  Model,
  Label,
} from "../../../../shared/classifier/classifier-v1.mjs";
import type { Answer, InputSchema } from "../../types/workspace";
const props = defineProps<{
  model: Model;
  modelValue: Answer;
  schema: InputSchema;
  disabled?: boolean;
  hideRationale?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Answer] }>();
const names: Record<Label, string> = {
  technical_issue: "技术问题",
  concept_confusion: "概念困惑",
  schedule_constraint: "时间安排",
  motivation_support: "学习支持",
};
const labelExamples: Record<Label, string> = {
  technical_issue: "页面一直转圈，课程打不开。",
  concept_confusion: "这个公式为什么用报名人数做分母？",
  schedule_constraint: "这周要出差，作业可以延期交吗？",
  motivation_support: "进度一直跟不上，想知道怎么坚持下去。",
};
const definitions = () =>
  (props.modelValue.definitionVariantIds as Record<string, string>) || {};
const examples = () => (props.modelValue.exampleIds as string[]) || [];
function update(key: string, value: unknown) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}
function toggle(id: string) {
  const selected = examples();
  update(
    "exampleIds",
    selected.includes(id)
      ? selected.filter((value) => value !== id)
      : selected.length < 4
        ? [...selected, id]
        : selected,
  );
}
</script>
<template>
  <div class="classifier-config">
    <h2>标签定义</h2>
    <p class="classifier-config-help">
      每个标签代表一种求助。用下拉框选择「基础定义」或「补充措辞」。补充措辞后，分类器会更重视这类消息中常见的表达。
    </p>
    <label
      v-for="label in model.labelOrder"
      :key="label"
      class="classifier-definition"
      ><strong>{{ names[label] }}</strong
      ><select
        :name="`definition-${label}`"
        :disabled="disabled"
        :value="definitions()[label]"
        @change="
          update('definitionVariantIds', {
            ...definitions(),
            [label]: ($event.target as HTMLSelectElement).value,
          })
        "
      >
        <option
          v-for="variant in model.definitionVariants.filter(
            (value) => value.label === label,
          )"
          :key="variant.id"
          :value="variant.id"
        >
          {{ variant.title.replace(/^[^：]*：/, "") }}
        </option></select
      ><small>{{
        model.definitionVariants.find(
          (value) => value.id === definitions()[label],
        )?.description
      }}</small><small>例子 · {{ labelExamples[label] }}</small></label
    >
    <div class="classifier-change-example">
      <p><strong>只改「技术问题」会怎样？</strong></p>
      <p>同一句「{{ labelExamples.technical_issue }}」在门槛为 0.55、低分转人工时：</p>
      <ul>
        <li><strong>改前 · 基础定义</strong> 得分约 0.38，交人工复核。</li>
        <li><strong>改后 · 补充措辞</strong> 「一直转圈」被更重视，得分约 0.80，自动分到技术问题。</li>
      </ul>
      <p>这是单条消息的示范。下一步可以运行你的设置，看看整批消息的结果。</p>
    </div>
    <details class="classifier-examples">
      <summary>
        候选示例（最多4条） <span>已选 {{ examples().length }} 条</span>
      </summary>
      <label v-for="item in model.examples" :key="item.exampleId"
        ><input
          type="checkbox"
          name="exampleIds"
          :value="item.exampleId"
          :checked="examples().includes(item.exampleId)"
          :disabled="
            disabled ||
            (!examples().includes(item.exampleId) && examples().length >= 4)
          "
          @change="toggle(item.exampleId)"
        /><span
          ><b>{{ names[item.goldLabel] }}</b> · {{ item.messageText }}</span
        ></label
      >
    </details>
    <fieldset class="workspace-radios" :disabled="disabled" aria-describedby="classifier-threshold-help">
      <legend>置信度阈值</legend>
      <label v-for="value in [0.4, 0.55, 0.7]" :key="value"
        ><input
          type="radio"
          name="confidenceThreshold"
          :value="value"
          :checked="modelValue.confidenceThreshold === value"
          @change="update('confidenceThreshold', value)"
        />{{ value.toFixed(2) }}</label
      >
    </fieldset>
    <p id="classifier-threshold-help" class="classifier-config-help">
      这是系统得多有把握才会自动分派的门槛。开启「转人工复核」时，调高门槛会让更多拿不准的消息交给人，调低就会让更多消息自动分派。例如得分 0.60 的消息，在门槛 0.55 时自动分派，在 0.70 时交人工。
    </p>
    <fieldset class="workspace-radios" :disabled="disabled">
      <legend>低置信度时</legend>
      <label
        ><input
          type="radio"
          name="lowConfidencePolicy"
          value="MANUAL_REVIEW"
          :checked="modelValue.lowConfidencePolicy === 'MANUAL_REVIEW'"
          @change="update('lowConfidencePolicy', 'MANUAL_REVIEW')"
        />转人工复核</label
      ><label
        ><input
          type="radio"
          name="lowConfidencePolicy"
          value="AUTO_ROUTE"
          :checked="modelValue.lowConfidencePolicy === 'AUTO_ROUTE'"
          @change="update('lowConfidencePolicy', 'AUTO_ROUTE')"
        />自动分派</label
      >
    </fieldset>
    <p v-if="modelValue.lowConfidencePolicy === 'AUTO_ROUTE'" class="classifier-config-help" role="status">
      当前低分也自动分派，门槛不会改变消息去向。
    </p>
    <div v-if="!hideRationale" class="classifier-rationale">
      <label
        v-for="item in [
          { key: 'modificationReason', label: '修改理由' },
          { key: 'expectedEffect', label: '预期影响' },
        ]"
        :key="item.key"
        ><strong>{{ item.label }}</strong
        ><textarea
          :name="item.key"
          :disabled="disabled"
          :maxlength="schema.properties[item.key]?.maxLength"
          :value="String(modelValue[item.key] || '')"
          rows="3"
          @input="
            update(item.key, ($event.target as HTMLTextAreaElement).value)
          "
        /><small
          >{{ [...String(modelValue[item.key] || "")].length }} /
          {{ schema.properties[item.key]?.maxLength }}</small
        ></label
      >
    </div>
  </div>
</template>
