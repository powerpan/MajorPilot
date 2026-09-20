<script setup lang="ts">
import type { Answer, InputSchema } from "../../types/workspace";
const props = defineProps<{
  schema: InputSchema;
  modelValue: Answer;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Answer] }>();
const labels: Record<string, string> = {
  acknowledged: "我已了解并完成上述要求",
  multiplier: "倍数",
  include: "样本范围",
  observation: "我的观察",
  taskGoal: "这项任务的目标",
  priorityMetric: "我优先关注的指标",
  errorCostReason: "错误代价与我的理由",
  comparisonNotes: "哪些变化值得关注？",
  tradeoff: "这次调整的代价或局限是什么？",
  rolloutDecision: "使用决定",
  decisionReason: "决定的依据",
  monitoringItems: "需要监控什么？",
  residualRisk: "仍然存在的风险",
};
const choices: Record<string, string> = {
  ALL: "全部样本",
  FIRST_TWO: "前两行样本",
  ROUTE_SUPPORT_REQUESTS: "将支持请求交给合适团队",
  GENERATE_EVERY_ANSWER: "自动生成全部回答",
  ASSESS_STUDENT_ABILITY: "评价学生能力",
  COVERAGE: "自动路由覆盖率",
  AUTO_ACCURACY: "自动路由准确率",
  RECALL: "类别召回率",
  CONTINUE_EXPERIMENT: "继续试验",
  LIMITED_PILOT: "有限范围试用",
  DO_NOT_DEPLOY: "暂不上线",
};
function update(key: string, value: unknown) {
  const next = { ...props.modelValue, [key]: value };
  if (value === false && props.schema.properties[key]?.const === true)
    delete next[key];
  emit("update:modelValue", next);
}
</script>
<template>
  <div class="workspace-fields">
    <template v-for="(field, key) in schema.properties" :key="key">
      <label v-if="field.type === 'boolean'" class="workspace-check">
        <input
          type="checkbox"
          :name="String(key)"
          :checked="modelValue[key] === true"
          :disabled="disabled"
          @change="
            update(String(key), ($event.target as HTMLInputElement).checked)
          "
        />
        <span>{{ labels[key] || key }}</span>
      </label>
      <fieldset
        v-else-if="
          field.enum && ['integer', 'number'].includes(String(field.type))
        "
        :disabled="disabled"
        class="workspace-radios"
      >
        <legend>{{ labels[key] || key }}</legend>
        <label v-for="option in field.enum" :key="option"
          ><input
            type="radio"
            :name="String(key)"
            :value="option"
            :checked="modelValue[key] === option"
            @change="update(String(key), option)"
          /><span>{{ option }}</span></label
        >
      </fieldset>
      <label v-else-if="field.enum" class="workspace-select"
        ><span>{{ labels[key] || key }}</span>
        <select
          :name="String(key)"
          :value="modelValue[key] ?? ''"
          :disabled="disabled"
          @change="
            update(String(key), ($event.target as HTMLSelectElement).value)
          "
        >
          <option value="" disabled>请选择</option>
          <option v-for="option in field.enum" :key="option" :value="option">
            {{ choices[String(option)] || option }}
          </option>
        </select>
      </label>
      <label v-else-if="field.type === 'string'" class="workspace-textarea"
        ><span>{{ labels[key] || key }}</span>
        <textarea
          :name="String(key)"
          :value="String(modelValue[key] || '')"
          :maxlength="field.maxLength"
          :disabled="disabled"
          rows="7"
          :aria-describedby="`field-${key}-help`"
          @input="
            update(String(key), ($event.target as HTMLTextAreaElement).value)
          "
        />
        <small :id="`field-${key}-help`"
          >{{ field.minLength || 0 }}–{{ field.maxLength || 500 }}字 · 已输入
          {{
            [...String(modelValue[key] || "")].length
          }}字。未达到要求时先保留在本机。</small
        >
      </label>
      <label
        v-else-if="field.type === 'array' && field.items?.type === 'string'"
        class="workspace-textarea"
        ><span
          >{{ labels[key] || key }}（每行一项，{{ field.minItems || 1 }}–{{
            field.maxItems || 3
          }}项）</span
        ><textarea
          :name="String(key)"
          :disabled="disabled"
          :value="
            Array.isArray(modelValue[key])
              ? (modelValue[key] as string[]).join('\n')
              : ''
          "
          rows="3"
          @input="
            update(
              String(key),
              ($event.target as HTMLTextAreaElement).value.split('\n'),
            )
          "
        />
      </label>
      <p v-else class="error-notice" role="alert">
        此版本包含暂不支持的输入类型，请联系支持；不会提交空白替代内容。
      </p>
    </template>
  </div>
</template>
