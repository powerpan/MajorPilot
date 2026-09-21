<script setup lang="ts">
import type { ReportClaim, ReportSource } from "../../types/reports";
import { dimensions } from "../../lib/report-display";
import { major } from "../../data/majors";
import ReportClaimRow from "./ReportClaimRow.vue";
defineProps<{
  claims: ReportClaim[];
  sources: ReportSource[];
  printing?: boolean;
}>();
</script>
<template>
  <table class="report-dimensions">
    <thead>
      <tr>
        <th scope="col">共同维度</th>
        <th v-for="source in sources" :key="source.majorCode" scope="col">
          {{ major(source.majorCode).name }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="dimension in dimensions" :key="dimension.key">
        <th scope="row">{{ dimension.label }}</th>
        <td v-for="source in sources" :key="source.majorCode">
          <span class="report-mobile-major">{{
            major(source.majorCode).name
          }}</span
          ><ReportClaimRow
            v-for="claim in claims.filter(
              (value) =>
                value.dimensionKey === dimension.key &&
                value.majorCode === source.majorCode,
            )"
            :key="claim.text"
            :claim="claim"
            :printing="printing"
          />
        </td>
      </tr>
    </tbody>
  </table>
</template>
