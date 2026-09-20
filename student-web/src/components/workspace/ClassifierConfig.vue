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
}>();
const emit = defineEmits<{ "update:modelValue": [value: Answer] }>();
const names: Record<Label, string> = {
  technical_issue: "技术问题",
  concept_confusion: "概念困惑",
  schedule_constraint: "时间安排",
  motivation_support: "学习支持",
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
          {{ variant.title }}
        </option></select
      ><small>{{
        model.definitionVariants.find(
          (value) => value.id === definitions()[label],
        )?.description
      }}</small></label
    >
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
    <fieldset class="workspace-radios" :disabled="disabled">
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
        />自动路由</label
      >
    </fieldset>
    <div class="classifier-rationale">
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
