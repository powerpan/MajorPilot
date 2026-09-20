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
};
const choices: Record<string, string> = {
  ALL: "全部样本",
  FIRST_TWO: "前两行样本",
};
function update(key: string, value: unknown) {
  const next = { ...props.modelValue, [key]: value };
  if (value === false && props.schema.properties[key]?.const === true) delete next[key];
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
        v-else-if="field.enum && field.type === 'integer'"
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
      <p v-else class="error-notice" role="alert">
        此版本包含暂不支持的输入类型，请联系支持；不会提交空白替代内容。
      </p>
    </template>
  </div>
</template>
