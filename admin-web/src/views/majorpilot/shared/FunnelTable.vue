<script setup lang="ts">
import type { Funnel } from '@/types/majorpilot'
import { rate, stage, term } from './format'
defineProps<{ funnel: Funnel }>()
</script>
<template><section class="mp-funnel"><h3>{{ term(funnel.key) }}</h3><p class="mp-muted">计数主体：{{ term(funnel.grain) }} · 起点：{{ term(funnel.anchor) }}</p><el-table :data="funnel.stages" stripe><el-table-column label="阶段" min-width="230"><template #default="{ row }">{{ stage(row.key) }}</template></el-table-column><el-table-column prop="count" label="人数" width="110" /><el-table-column label="上一步转化" width="140"><template #default="{ row }">{{ rate(row.previousConversion) }}</template></el-table-column><el-table-column label="累计转化" width="140"><template #default="{ row }">{{ rate(row.cumulativeConversion) }}</template></el-table-column></el-table><p v-for="(note,i) in funnel.coverageNotes" :key="i" class="mp-muted">{{ term(note) }}</p></section></template>
