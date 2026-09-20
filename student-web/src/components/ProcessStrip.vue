<template>
  <section class="process-strip" aria-label="体验流程">
    <h2 class="serif">体验<br />流程</h2>
    <div
      v-for="(item, index) in [
        ['说说你的选择', '先获得初始建议。'],
        ['做一次专业任务', '任务开放后，再逐步体验与比较。'],
        ['带着证据继续探索', '从不同专业视角，拓展你的思考。'],
      ]"
      :key="item[0]"
    >
      <span class="process-number serif">0{{ index + 1 }}</span>
      <section>
        <h3 class="serif">{{ item[0] }}</h3>
        <p>{{ item[1] }}</p>
      </section>
    </div>
  </section>
</template>
