<script setup lang="ts">
import type { InputProperty } from "../../types/workspace";
import { baLabel } from "../../lib/ba-display";
const props = defineProps<{
  name: string;
  label: string;
  value: unknown;
  schema?: InputProperty;
  disabled: boolean;
  options?: (string | number)[];
  kind?: "text" | "select" | "number" | "radio";
}>();
const emit = defineEmits<{ change: [value: unknown] }>();
function update(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  emit(
    "change",
    props.kind === "number" ? (raw === "" ? undefined : Number(raw)) : raw,
  );
}
</script>
<template>
  <fieldset v-if="kind === 'radio'" class="ba-radio" :disabled="disabled">
    <legend>{{ label }}</legend>
    <label v-for="option in options || schema?.enum" :key="option"
      ><input
        type="radio"
        :name="name"
        :value="option"
        :checked="value === option"
        @change="emit('change', option)"
      />{{ baLabel(option) }}{{ name === "reviewAfterDays" ? "天" : "" }}</label
    >
  </fieldset>
  <label v-else class="ba-field"
    ><span>{{ label }}</span>
    <select
      v-if="kind === 'select'"
      :name="name"
      :value="value ?? ''"
      :disabled="disabled"
      @change="update"
    >
      <option value="" disabled>请选择</option>
      <option
        v-for="option in options || schema?.enum"
        :key="option"
        :value="option"
      >
        {{ baLabel(option) }}
      </option>
    </select>
    <input
      v-else-if="kind === 'number'"
      type="number"
      :name="name"
      :value="value ?? ''"
      :min="schema?.minimum"
      :max="schema?.maximum"
      :step="schema?.type === 'integer' ? 1 : 'any'"
      :disabled="disabled"
      @input="update"
    />
    <textarea
      v-else
      :name="name"
      rows="3"
      :value="String(value ?? '')"
      :maxlength="schema?.maxLength"
      :disabled="disabled"
      placeholder="请写下你的思考…"
      @input="update"
    />
    <small v-if="!kind || kind === 'text'"
      >{{ [...String(value ?? "")].length }} / {{ schema?.maxLength }}</small
    >
  </label>
</template>
