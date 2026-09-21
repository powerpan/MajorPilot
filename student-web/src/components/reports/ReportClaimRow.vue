<script setup lang="ts">
import type { ReportClaim } from "../../types/reports";
import { claimLabels } from "../../lib/report-display";
defineProps<{ claim: ReportClaim; printing?: boolean }>();
</script>
<template>
  <div class="report-claim" :data-claim-type="claim.claimType">
    <span class="report-claim-type">{{ claimLabels[claim.claimType] }}</span>
    <div class="report-claim-body">
      <p class="report-claim-text">{{ claim.text }}</p>
      <p v-if="printing" class="report-basis-copy">
        依据：{{ claim.basisSummary }}
      </p>
      <details v-else class="report-basis">
        <summary>查看依据 <span aria-hidden="true">›</span></summary>
        <p class="report-basis-copy">{{ claim.basisSummary }}</p>
      </details>
    </div>
  </div>
</template>
