<script setup lang="ts">
import { computed, ref } from "vue";
import { ElAlert, ElForm, ElFormItem, ElInput, ElButton } from "element-plus";
import "element-plus/dist/index.css";
import {
  execute,
  type ExecutionTemplate,
  type ExecutionResult,
} from "../execution";

const input = ref("12, 18, 24, 30");
const busy = ref(false);
const result = ref<ExecutionResult | null>(null);
const error = ref("");
async function run(template: ExecutionTemplate = "summary-v1") {
  busy.value = true;
  error.value = "";
  result.value = null;
  try {
    const parts = input.value.split(",").map((value) => value.trim());
    const values = parts.map(Number);
    if (
      parts.some((value) => !value) ||
      values.some((value) => !Number.isFinite(value))
    )
      throw new Error("请输入逗号分隔的有效数字");
    result.value = await execute(template, values);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "执行失败";
  } finally {
    busy.value = false;
  }
}
const python = computed(() => {
  const parts = input.value.split(",").map((value) => value.trim());
  const values = parts.map(Number);
  if (parts.some((value) => !value) || !values.every(Number.isFinite))
    return "# 请先输入有效数字；此区域不会执行代码";
  const literal = JSON.stringify(values);
  return `# 只读等价示例，不接收或执行用户 Python\nvalues = ${literal}\nresult = {"count": len(values), "mean": sum(values) / len(values)}`;
});
</script>

<template>
  <main>
    <h1>MajorPilot · P0 技术验证</h1>
    <el-alert
      title="这是技术基线验证页，不是已完成的学生产品。"
      type="info"
      :closable="false"
      show-icon
    />
    <section aria-labelledby="executor-heading">
      <h2 id="executor-heading">受限执行器</h2>
      <p>
        只接收数字参数，运行可信固定计算器；不接受任意 Python 或
        JavaScript。每次执行在独立沙箱中销毁重建。
      </p>
      <el-form label-position="top" @submit.prevent="run()">
        <el-form-item label="合成数据（逗号分隔）">
          <el-input v-model="input" aria-label="合成数据" :disabled="busy" />
        </el-form-item>
        <div class="actions">
          <el-button type="primary" :loading="busy" @click="run()"
            >运行固定计算器</el-button
          >
          <el-button :disabled="busy" @click="run('isolation-probe-v1')"
            >验证网络与存储隔离</el-button
          >
          <el-button :disabled="busy" @click="run('timeout-probe-v1')"
            >验证 10 秒超时</el-button
          >
        </div>
      </el-form>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        role="alert"
      />
      <div v-if="result" aria-live="polite" data-testid="execution-result">
        <h3>
          {{ result.status === "SUCCESS" ? "执行完成" : "执行被限制" }} ·
          {{ result.elapsedMs }} ms
        </h3>
        <pre>{{ JSON.stringify(result, null, 2) }}</pre>
      </div>
      <h3>只读 Python 对照</h3>
      <pre>{{ python }}</pre>
      <p class="muted">
        上限：输入 1 MiB、输出 100 KiB、执行 10 秒。P0
        结果仅验证基础设施，不参与专业评价。
      </p>
    </section>
  </main>
</template>

<style scoped>
main {
  max-width: 960px;
  margin: 40px auto;
  padding: 0 24px;
  color: #303133;
  font-family: Arial, "PingFang SC", sans-serif;
  line-height: 1.6;
}
h1 {
  font-size: 28px;
  line-height: 1.3;
  margin: 0 0 24px;
}
h2 {
  font-size: 22px;
}
h3 {
  font-size: 16px;
}
section {
  margin-top: 32px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
}
.actions :deep(.el-button) {
  margin-left: 0;
}
pre {
  background: #f5f7fa;
  padding: 16px;
  overflow: auto;
  border-radius: 4px;
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.muted {
  color: #606266;
  font-size: 13px;
}
@media (max-width: 600px) {
  main {
    margin: 24px auto;
    padding: 0 16px;
  }
  h1 {
    font-size: 24px;
  }
  .actions {
    flex-direction: column;
  }
  .actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
