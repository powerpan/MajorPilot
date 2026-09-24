<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useReports } from "../stores/reports";
import { useAuth } from "../stores/auth";
import { major } from "../data/majors";
import { reportDate, waitingLabels, reportChapters, generationExplanation } from "../lib/report-display";
import { observePrivateContent, sendPrivateObservation } from "../lib/events";
import ReportBody from "../components/reports/ReportBody.vue";
import ReportFeedback from "../components/reports/ReportFeedback.vue";
import NextRecommendationPanel from "../components/reports/NextRecommendationPanel.vue";
const route = useRoute(),
  router = useRouter(),
  reader = useReports(),
  auth = useAuth();
const printing = computed(() => route.name === "report-print"),
  title = computed(() =>
    reader.report?.reportType === "COMPARISON"
      ? "你的专业体验比较"
      : reader.report?.majorCode
        ? `${major(reader.report.majorCode).name} 体验报告`
        : "体验报告",
  );
const activeSection = ref(""),
  printReady = ref(false),
  core = ref<HTMLElement | null>(null);
let dispose: (() => void) | undefined;
let scrollFrame = 0;
function trackSection() {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    if (!reader.report || printing.value) return;
    const sections = reportChapters(reader.report);
    const current = [...sections].reverse().find((section) => {
      const element = document.getElementById(`section-${section.sectionKey}`);
      return element && element.getBoundingClientRect().top <= 150;
    });
    activeSection.value = (current || sections[0])?.sectionKey || "";
  });
}
window.addEventListener("scroll", trackSection, { passive: true });
window.addEventListener("resize", trackSection, { passive: true });
watch(
  () => route.fullPath,
  () => {
    dispose?.();
    printReady.value = false;
    activeSection.value = "";
    void reader.open({
      kind:
        route.name === "comparison-report"
          ? "comparison"
          : printing.value
            ? "print"
            : "report",
      reportId: String(route.params.reportId || ""),
      expectedVersionId:
        typeof route.query.expectedVersion === "string"
          ? route.query.expectedVersion
          : undefined,
    });
  },
  { immediate: true },
);
watch(
  () => reader.report?.reportVersionId,
  async (version) => {
    dispose?.();
    printReady.value = false;
    if (!version) return;
    await nextTick();
    if (!core.value || reader.report?.reportVersionId !== version) return;
    activeSection.value = reportChapters(reader.report)[0]?.sectionKey || "";
    dispose = observePrivateContent(core.value, () => {
      if (printing.value) printReady.value = true;
      else
        sendPrivateObservation(
          reader.report?.reportType === "COMPARISON"
            ? "comparison_report.viewed"
            : "report.viewed",
          version,
        );
    });
  },
);
onBeforeUnmount(() => {
  cancelAnimationFrame(scrollFrame);
  window.removeEventListener("scroll", trackSection);
  window.removeEventListener("resize", trackSection);
  dispose?.();
  reader.clear();
});
function jump(value: string) {
  activeSection.value = value;
  const element = document.getElementById(`section-${value}`);
  element?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
  element?.focus({ preventScroll: true });
}
function print() {
  if (!reader.report) return;
  if (!printing.value) {
    void router.push({
      name: "report-print",
      params: { reportId: reader.report.reportId },
      query: { expectedVersion: reader.report.reportVersionId },
    });
    return;
  }
  if (!printReady.value || document.visibilityState !== "visible") return;
  sendPrivateObservation("report.printed", reader.report.reportVersionId);
  window.print();
}
const ordinaryLink = computed(() =>
  reader.report
    ? `/app/reports/${reader.report.reportId}`
    : route.params.reportId
      ? `/app/reports/${route.params.reportId}`
      : "/app",
);
</script>
<template>
  <div class="report-reader" :class="{ 'is-print-view': printing }">
    <header class="report-header">
      <RouterLink to="/" class="brand" aria-label="MajorPilot 首页"
        ><svg viewBox="0 0 44 40" aria-hidden="true">
          <path d="M3 28 31 5 23 25Z" fill="#304FFE" />
          <path d="m33 5 10 35-18-12Z" fill="#F45B35" /></svg
        ><span>MajorPilot</span></RouterLink
      >
      <nav aria-label="报告操作">
        <RouterLink to="/app">个人主页</RouterLink
        ><button
          v-if="reader.report"
          class="quiet-button report-print-button"
          :disabled="printing && !printReady"
          @click="print"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6zM17 11h1"
              stroke="currentColor"
              stroke-width="1.5"
            /></svg
          >{{ printing ? "打印此版本" : "打印" }}
        </button>
      </nav>
    </header>
    <main class="report-layout">
      <nav
        v-if="reader.report && !printing"
        class="report-chapters"
        aria-label="报告章节"
      >
        <a
          v-for="(section, index) in reportChapters(reader.report)"
          :key="section.sectionKey"
          :href="`#section-${section.sectionKey}`"
          :aria-current="
            activeSection === section.sectionKey ? 'location' : undefined
          "
          @click.prevent="jump(section.sectionKey)"
          ><span class="serif">{{ String(index + 1).padStart(2, "0") }}</span
          >{{ section.title }}</a
        >
      </nav>
      <article class="report-document">
        <p v-if="reader.loading" class="loading-state" role="status">
          正在加载报告…
        </p>
        <template v-if="reader.report"
          ><header ref="core" class="report-document-header">
            <h1 class="serif">{{ title }}</h1>
            <p class="report-boundary">
              {{
                reader.report.reportType === "COMPARISON"
                  ? "把经历并排，把决定留给你。不合成为总分，也不替你作最终专业决定。"
                  : "这是一次体验总结，不是专业适配度测试或录取判断。"
              }}
            </p>
            <p class="report-metadata">
              报告版本 {{ reader.report.versionNo }} ·
              {{ reportDate(reader.report.generatedAt)
              }}<template v-if="reader.report.reportType === 'EXPERIENCE'">
                · 任务版本
                {{ reader.report.sources[0]?.taskVersionCode }}</template
              >
            </p>
            <p
              v-if="reader.report.reportType === 'EXPERIENCE'"
              class="report-metadata"
            >
              {{ reader.report.sources[0]?.taskTitle }}
            </p>
          </header>
          <div v-if="!printing" class="report-mobile-jump">
            <label
              >跳转章节<select
                :value="activeSection"
                @change="jump(($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="section in reportChapters(reader.report)"
                  :key="section.sectionKey"
                  :value="section.sectionKey"
                >
                  {{ section.title }}
                </option>
              </select></label
            >
          </div>
          <p
            v-if="reader.report.generationMode === 'DETERMINISTIC_FALLBACK'"
            class="report-status-note"
            role="status"
          >
            部分个性化解释暂不可用；事实、自述和本次成果仍可查看。
          </p>
          <div
            v-if="
              !printing && (reader.generation || reader.newVersionAvailable)
            "
            class="report-update-note"
            role="status"
          >
            <template v-if="reader.newVersionAvailable"
              >报告已有新版本。当前页面仍保留你正在阅读的版本。<button
                class="plain-button text-link"
                @click="reader.refreshContent"
              >
                读取新版本
              </button></template
            ><template v-else-if="reader.generation?.status === 'FAILED'"
              >更新准备异常；当前已发布报告仍可阅读。</template
            ><template v-else-if="reader.generation?.status === 'GENERATING'"
              >新版本正在准备；当前已发布报告仍可阅读。</template
            >
          </div>
          <div
            v-if="reader.report.reportType === 'COMPARISON'"
            class="report-sources"
          >
            <strong>固定来源：</strong
            ><span
              v-for="source in reader.report.sources"
              :key="source.majorCode"
              ><template v-if="source.sourceReport"
                ><RouterLink
                  v-if="
                    !printing &&
                    reader.sourceReadable[source.sourceReport.reportVersionId]
                  "
                  :to="{
                    name: 'report-reader',
                    params: { reportId: source.sourceReport.reportId },
                    query: {
                      expectedVersion: source.sourceReport.reportVersionId,
                    },
                  }"
                  >{{ major(source.majorCode).name }} · 报告版本{{
                    source.sourceReport.versionNo
                  }}</RouterLink
                ><template v-else
                  >{{ major(source.majorCode).name }} · 报告版本{{
                    source.sourceReport.versionNo
                  }}<small v-if="!printing"
                    >（按固定来源比较；来源当前版本待确认或已有更新，不提供旧正文入口）</small
                  ></template
                ></template
              ></span
            >
          </div>
          <ReportBody :report="reader.report" :printing="printing"
            ><template #next
              ><template v-if="!printing"
                ><NextRecommendationPanel
                  v-if="reader.report.nextRecommendation.recommendationId"
                  :recommendation-id="
                    reader.report.nextRecommendation.recommendationId
                  "
                />
                <p
                  v-else-if="
                    reader.report.nextRecommendation.state === 'ALL_COMPLETED'
                  "
                  class="report-all-completed"
                >
                  你已完成三个正式专业体验。可以继续比较已有经历、了解课程与真实项目；不需要重新选择已完成方向。
                </p></template
              ></template
            ></ReportBody
          >
          <ReportFeedback
            v-if="!printing"
            :key="reader.report.reportVersionId"
            :version-id="reader.report.reportVersionId"
          />
          <footer class="report-version-footer">
            报告版本 {{ reader.report.versionNo }} ·
            {{ reportDate(reader.report.generatedAt)
            }}<span v-if="printing">
              · {{ reader.report.reportVersionId }}</span
            >
            <p>体验总结，不是适配度测试或录取判断。</p>
          </footer>
        </template>
        <section v-else-if="!reader.loading" class="report-empty">
          <h1 class="serif">
            {{
              route.name === "comparison-report" ? "专业体验比较" : "体验报告"
            }}
          </h1>
          <p v-if="reader.waiting">
            {{ waitingLabels[reader.waiting.reason] }}
          </p>
          <p v-else-if="reader.preparing">
            体验已完成，报告正在准备。你可以安全离开，稍后回来查看。
          </p>
          <p v-else-if="!auth.me">
            登录状态已失效，请登录后重新读取本账户的报告。
          </p>
          <p v-else-if="!reader.error">当前暂无可读取的报告。</p>
          <p v-if="reader.preparing" role="status">{{ generationExplanation(reader.generation?.phase) }}</p>
          <div class="button-row">
            <RouterLink to="/app" class="text-link">返回个人主页 →</RouterLink
            ><RouterLink v-if="!auth.me" to="/login" class="quiet-button"
              >登录</RouterLink
            >
          </div>
        </section>
        <div v-if="reader.error" class="error-notice" role="alert">
          {{ reader.error
          }}<RouterLink
            v-if="reader.errorCode === 'REPORT_VERSION_CHANGED'"
            :to="ordinaryLink"
            class="text-link"
            >返回报告并刷新</RouterLink
          >
        </div>
        <button
          v-if="!printing && !reader.loading"
          class="quiet-button report-refresh"
          :disabled="reader.refreshing"
          @click="reader.refreshStatus"
        >
          {{ reader.refreshing ? "正在刷新…" : "刷新状态" }}
        </button>
        <RouterLink
          v-if="printing"
          :to="ordinaryLink"
          class="text-link report-back"
          >返回阅读页</RouterLink
        >
      </article>
    </main>
  </div>
</template>
