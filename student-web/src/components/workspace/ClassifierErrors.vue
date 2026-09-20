<script setup lang="ts">
import type {
  Sample,
  Prediction,
} from "../../../../shared/classifier/classifier-v1.mjs";
import type { Answer } from "../../types/workspace";
const props = defineProps<{
  samples: (Sample & { baseline: Prediction })[];
  modelValue: Answer;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Answer] }>();
const names: Record<string, string> = {
  technical_issue: "技术问题",
  concept_confusion: "概念困惑",
  schedule_constraint: "时间安排",
  motivation_support: "学习支持",
  MANUAL_REVIEW: "人工复核",
};
const codes: Record<string, string> = {
  AMBIGUOUS_WORDING: "措辞含混",
  DEFINITION_BOUNDARY: "定义边界",
  EXAMPLE_GAP: "示例缺口",
  LOW_CONFIDENCE: "低置信度",
};
const selected = () => (props.modelValue.inspectedSampleIds as string[]) || [];
const patterns = () => (props.modelValue.errorPatterns as Answer[]) || [{}, {}];
function select(id: string) {
  const values = selected();
  emit("update:modelValue", {
    ...props.modelValue,
    inspectedSampleIds: values.includes(id)
      ? values.filter((value) => value !== id)
      : values.length < 10
        ? [...values, id]
        : values,
  });
}
function pattern(index: number, key: string, value: unknown) {
  const next = patterns().map((value) => ({ ...value }));
  next[index]![key] = value;
  emit("update:modelValue", { ...props.modelValue, errorPatterns: next });
}
function reference(index: number, id: string) {
  const values = (patterns()[index]?.sampleIds as string[]) || [];
  pattern(
    index,
    "sampleIds",
    values.includes(id)
      ? values.filter((value) => value !== id)
      : values.length < 5
        ? [...values, id]
        : values,
  );
}
</script>
<template>
  <div class="classifier-errors">
    <h2>公开练习 · 已选择 {{ selected().length }} / 8–10 条</h2>
    <div class="classifier-practice-list">
      <label v-for="sample in samples" :key="sample.sampleId"
        ><input
          type="checkbox"
          name="inspectedSampleIds"
          :value="sample.sampleId"
          :checked="selected().includes(sample.sampleId)"
          :disabled="
            disabled ||
            (!selected().includes(sample.sampleId) && selected().length >= 10)
          "
          @change="select(sample.sampleId)"
        /><span
          ><b>{{ sample.sampleId }}</b> {{ sample.messageText
          }}<small
            >审核标签：{{ names[sample.goldLabel] }} · 基线路由：{{
              names[sample.baseline.routedLabel]
            }}
            · 置信度 {{ (sample.baseline.confidence * 100).toFixed(1) }}%</small
          ></span
        ></label
      >
    </div>
    <section
      v-for="(value, index) in patterns()"
      :key="index"
      class="classifier-pattern"
    >
      <h2>错误模式 {{ index + 1 }}</h2>
      <label class="workspace-select"
        ><span>模式类别</span
        ><select
          :name="`pattern-${index}`"
          :value="value.patternCode || ''"
          :disabled="disabled"
          @change="
            pattern(
              index,
              'patternCode',
              ($event.target as HTMLSelectElement).value,
            )
          "
        >
          <option value="" disabled>请选择</option>
          <option v-for="(label, code) in codes" :key="code" :value="code">
            {{ label }}
          </option>
        </select></label
      >
      <fieldset :disabled="disabled">
        <legend>引用案例（1–5条）</legend>
        <label v-for="id in selected()" :key="id"
          ><input
            type="checkbox"
            :name="`pattern-sample-${index}`"
            :value="id"
            :checked="((value.sampleIds as string[]) || []).includes(id)"
            @change="reference(index, id)"
          />{{ id }}</label
        >
      </fieldset>
      <label class="workspace-textarea"
        ><span>你的解释</span
        ><textarea
          :name="`explanation-${index}`"
          :disabled="disabled"
          maxlength="400"
          rows="3"
          :value="String(value.explanation || '')"
          @input="
            pattern(
              index,
              'explanation',
              ($event.target as HTMLTextAreaElement).value,
            )
          "
        />
      </label>
    </section>
    <button
      v-if="patterns().length < 3"
      type="button"
      class="text-link plain-button"
      :disabled="disabled"
      @click="
        emit('update:modelValue', {
          ...modelValue,
          errorPatterns: [...patterns(), {}],
        })
      "
    >
      增加第三类模式（可选）
    </button>
  </div>
</template>
