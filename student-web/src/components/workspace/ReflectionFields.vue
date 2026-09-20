<script setup lang="ts">
import { computed } from "vue";
import type {
  Answer,
  StepDefinition,
  InputSchema,
} from "../../types/workspace";
const props = defineProps<{
  modelValue: Answer;
  steps: StepDefinition[];
  disabled?: boolean;
  schema?: InputSchema;
  professional?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Answer] }>();
const difficulty = computed(() => [
  { value: "KNOWLEDGE", label: "知识背景" },
  { value: "TOOLS", label: "工具操作" },
  { value: "TIME", label: "时间安排" },
  {
    value: props.schema?.properties.difficultySources?.items?.enum?.includes(
      "WORK_STYLE",
    )
      ? "WORK_STYLE"
      : "TASK_STYLE",
    label: "任务方式",
  },
  { value: "OTHER", label: "其他" },
  { value: "NONE", label: "没有明显困难" },
]);
const willingness = [
  { value: "YES", label: "愿意" },
  { value: "UNSURE", label: "还不确定" },
  { value: "NO", label: "暂时不想" },
];
function update(key: string, value: unknown) {
  const next = { ...props.modelValue, [key]: value };
  if (Array.isArray(value) && value.length === 0) delete next[key];
  emit("update:modelValue", next);
}
function selected(key: string, value: string) {
  return (
    Array.isArray(props.modelValue[key]) &&
    (props.modelValue[key] as string[]).includes(value)
  );
}
function toggle(key: string, value: string) {
  let values = Array.isArray(props.modelValue[key])
    ? [...(props.modelValue[key] as string[])]
    : [];
  if (values.includes(value)) values = values.filter((item) => item !== value);
  else if (value === "NONE") values = [value];
  else {
    values = values.filter((item) => item !== "NONE");
    if (values.length < 3) values.push(value);
  }
  update(key, values);
}
function limitReached(key: string, value: string) {
  return (
    value !== "NONE" &&
    !selected(key, value) &&
    Array.isArray(props.modelValue[key]) &&
    (props.modelValue[key] as string[]).length >= 3
  );
}
</script>
<template>
  <div class="reflection-fields">
    <fieldset :disabled="disabled">
      <legend>
        1. 哪个环节最吸引你？<small
          >必填 · 选择1–3项，或选择暂时没有特别感兴趣的环节。</small
        >
      </legend>
      <div class="reflection-options">
        <label
          v-for="item in [
            ...steps.map((step) => ({
              value: step.stepKey,
              label: step.title,
            })),
            { value: 'NONE', label: '暂时没有' },
          ]"
          :key="item.value"
          ><input
            type="checkbox"
            name="interestingStepKeys"
            :value="item.value"
            :checked="selected('interestingStepKeys', item.value)"
            :disabled="limitReached('interestingStepKeys', item.value)"
            @change="toggle('interestingStepKeys', item.value)"
          />{{ item.label }}</label
        >
      </div>
    </fieldset>
    <fieldset :disabled="disabled">
      <legend>2. 困难主要来自哪里？<small>必填 · 最多选择3项</small></legend>
      <div class="reflection-options">
        <label v-for="item in difficulty" :key="item.value"
          ><input
            type="checkbox"
            name="difficultySources"
            :value="item.value"
            :checked="selected('difficultySources', item.value)"
            :disabled="limitReached('difficultySources', item.value)"
            @change="toggle('difficultySources', item.value)"
          />{{ item.label }}</label
        >
      </div>
    </fieldset>
    <fieldset :disabled="disabled">
      <legend>3. 你愿意继续做类似的工作吗？<small>必填</small></legend>
      <div class="reflection-options">
        <label v-for="item in willingness" :key="item.value"
          ><input
            type="radio"
            name="continueSimilarWork"
            :value="item.value"
            :checked="modelValue.continueSimilarWork === item.value"
            @change="update('continueSimilarWork', item.value)"
          />{{ item.label }}</label
        >
      </div>
    </fieldset>
    <details class="reflection-optional">
      <summary>4. 补充感受与下一步偏好（可选）</summary>
      <label class="workspace-textarea"
        ><span>还有什么想记录？<small>选填 · 最多500字</small></span
        ><textarea
          name="reflectionNote"
          :disabled="disabled"
          maxlength="500"
          rows="4"
          :value="String(modelValue.reflectionNote || '')"
          @input="
            update(
              'reflectionNote',
              ($event.target as HTMLTextAreaElement).value,
            )
          "
          placeholder="可以写下感受，也可以保留不确定。"
        />
      </label>
      <label class="workspace-select"
        ><span>下一次想比较哪种工作方式？<small>选填</small></span
        ><select
          name="nextWorkStyle"
          :disabled="disabled"
          :value="modelValue.nextWorkStyle || 'SKIPPED'"
          @change="
            update('nextWorkStyle', ($event.target as HTMLSelectElement).value)
          "
        >
          <option value="SKIPPED">暂时跳过</option>
          <option value="MODEL_ITERATION">模型迭代</option>
          <option value="DATA_REASONING">数据推理</option>
          <option value="BUSINESS_ACTION">业务行动</option>
          <option value="UNSURE">还不确定</option>
        </select></label
      >
      <p v-if="!professional" class="muted">
        AI追问为选填；技术演示暂不发起追问，不影响完成。
      </p>
    </details>
  </div>
</template>
