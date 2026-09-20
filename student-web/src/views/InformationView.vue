<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import ExploreSection from "../components/ExploreSection.vue";
import ProcessStrip from "../components/ProcessStrip.vue";
import ActionLink from "../components/ActionLink.vue";
import { majors } from "../data/majors";
const route = useRoute(),
  code = computed(
    () => majors.find((item) => item.code === String(route.params.code))?.code,
  );
</script>
<template>
  <main v-if="route.path.startsWith('/majors')" class="majors-page">
    <ExploreSection :initial="code" /><ProcessStrip />
    <section class="closing-cta">
      <h2 class="serif">
        先给好奇心，<br /><span class="blue">一个起点。</span>
      </h2>
      <ActionLink to="/intake/1">找到我的第一站</ActionLink>
    </section>
  </main>
  <main v-else-if="route.path === '/how-it-works'" class="content-page">
    <h1 class="serif">先实际体验，<br />再作更清晰的选择。</h1>
    <p>
      MajorPilot 从 AI、Data Science 和 Business Analytics
      三个方向开始，帮助正在考虑硕士专业的你观察不同的工作方式，而不是替你决定“最适合”的专业。
    </p>
    <h2>01 · 说说你的选择</h2>
    <p>
      用约3–5分钟填写12页基本信息。系统先给出真实的初始体验顺序和依据，再由你决定是否注册保存。当前背景和基础不会排除任何方向。
    </p>
    <h2>02 · 做一次专业任务</h2>
    <p>
      任务计划围绕虚构在线学习平台
      LumenLearn，每项约45–60分钟，提供必要背景、模板和逐层提示。正式任务将在后续阶段开放；当前可查看任务预览并保存选择。
    </p>
    <h2>03 · 带着证据继续探索</h2>
    <p>
      未来报告将区分你完成了什么、你的自述和有边界的系统解释。完成两个专业后，再比较不同的工作方式；第三个方向始终可选。
    </p>
    <div class="notice">
      不是性格测试，不提供专业适配度总分、人格标签、录取概率或院校推荐。
    </div>
    <p><ActionLink to="/intake/1" small>找到我的第一站</ActionLink></p>
  </main>
  <main v-else class="content-page legal-page">
    <RouterLink to="/" class="page-back">← 返回首页</RouterLink>
    <h1 class="serif">
      {{ route.path === "/privacy" ? "隐私政策" : "使用条款" }}
    </h1>
    <p class="muted">版本 v1 · 本地 MVP 阶段 · 2026年9月</p>
    <template v-if="route.path === '/privacy'"
      ><h2>收集哪些信息</h2>
      <p>
        收集你主动提供的决策阶段、目标时间与地区、当前背景、考虑方向、熟悉度、自评基础、情境偏好和工作环节；可选补充具体专业与困惑。注册需要邮箱和密码，不要求成绩单、GPA、简历或文件上传。
      </p>
      <h2>用途与推荐边界</h2>
      <p>
        基本信息用于保存进度、生成透明的初始建议、调整说明方式和分析产品方向。自由文本、基础自评和渠道不会改变规则排序；基础薄弱不排除任何专业。
      </p>
      <h2>保存与凭证</h2>
      <p>
        匿名草稿在最近有效操作后保留7天。未同步答案可能保存在当前浏览器标签页的本机草稿中；退出账户时清除。注册时将问卷一次性认领到你的账户。登录凭证使用受限HttpOnly
        Cookie，不放在浏览器脚本可读的持久化存储中。
      </p>
      <h2>AI 与服务提供方</h2>
      <p>
        模型仅承担经过限制的解释工作，不决定规则排名。当前可直接使用确定性结构化说明；AI
        不可用时核心流程仍然可用。浏览器不直接调用模型供应商，不向执行器传递账户、问卷、报告或秘密。
      </p>
      <h2>可选研究授权</h2>
      <p>
        可选的去标识化产品研究需单独同意，默认不选择。你可在账户与数据页面撤回，拒绝或撤回不会影响核心服务。
      </p>
      <h2>阶段范围</h2>
      <p>
        这是本地验证阶段，不是已上线的商业服务。后续阶段将交付个人数据导出与删除流程，包括确认后立即撤销会话及30天处理目标；当前界面不声称这些功能已经开放。系统不出售个人信息，不默认公开报告。
      </p></template
    ><template v-else
      ><h2>产品提供什么</h2>
      <p>
        MajorPilot
        提供专业工作方式的探索体验与解释。当前提供信息填写、初始推荐、账户验证与选择保存；专业任务、证据报告及跨专业比较将在后续阶段开放。
      </p>
      <h2>建议不是结论</h2>
      <p>
        推荐只安排第一次尝试的顺序，不是能力测试、适配判断、录取预测或职业承诺。你可以接受建议，也可以自由选择其他方向。
      </p>
      <h2>账户与使用</h2>
      <p>
        请使用你可以访问的邮箱，妥善保管密码。不要提交他人的敏感材料、秘密或不必要的个人资料。密码重置会使全部旧会话失效；账户验证和邮件链接不会自动登录。
      </p>
      <h2>真实与合成资料</h2>
      <p>
        LumenLearn
        及任务数据为教学情境和合成数据，不代表真实机构或真实学生。任务预览不创建正式体验记录，内容准备中的方向不会被记为已开始或已完成。
      </p>
      <h2>本地验证范围</h2>
      <p>
        本版本用于验证基础功能与产品方向，未提供公网部署、支付、申请咨询或院校服务，不承诺服务可用性、录取或职业结果。
      </p></template
    >
  </main>
</template>
