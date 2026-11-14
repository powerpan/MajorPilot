import "./lib/mail-token";
import "./lib/feedback-drafts";
import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import "./styles.css";
import "./styles/editorial.css";
import "./styles/workspace.css";
import "./styles/classifier.css";
import "./styles/ds.css";
import "./styles/ba.css";
import "./styles/reports.css";
import "./styles/privacy.css";
import { useAuth } from "./stores/auth";
import { pilotMode } from "./lib/pilot";
const HomeView = () => import("./views/HomeView.vue");
import IntakeView from "./views/IntakeView.vue";
import AuthView from "./views/AuthView.vue";
import MailView from "./views/MailView.vue";
import RecommendationView from "./views/RecommendationView.vue";
import DashboardView from "./views/DashboardView.vue";
import SettingsView from "./views/SettingsView.vue";
import InformationView from "./views/InformationView.vue";
import NotFoundView from "./views/NotFoundView.vue";
const P0View = () => import("./views/P0View.vue");
const DemoView = () => import("./views/DemoView.vue");
const WorkspaceView = () => import("./views/WorkspaceView.vue");
const PreviewView = () => import("./views/PreviewView.vue");
const ReportReaderView = () => import("./views/ReportReaderView.vue");
const FormalIntroductionView = () =>
  import("./views/FormalIntroductionView.vue");

const pinia = createPinia();
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, saved) {
    if (to.path === from.path) return;
    return saved || { top: 0 };
  },
  routes: [
    { path: "/", component: HomeView },
    { path: "/p0", component: P0View },
    { path: "/intake/:step(1[0-2]|[1-9])", component: IntakeView },
    { path: "/recommendation", component: RecommendationView },
    ...["/login", "/register", "/forgot-password"].map((path) => ({
      path,
      component: AuthView,
    })),
    ...["/verify-email", "/reset-password"].map((path) => ({
      path,
      component: MailView,
    })),
    { path: "/change-email", component: () => import("./views/EmailChangeView.vue") },
    { path: "/deletion-status/:receiptId", component: () => import("./views/DeletionReceiptView.vue") },
    ...["/how-it-works", "/majors", "/majors/:code", "/privacy", "/terms"].map(
      (path) => ({ path, component: InformationView }),
    ),
    { path: "/app", component: DashboardView, meta: { private: true } },
    { path: "/app/profile", component: () => import("./views/ProfileView.vue"), meta: { private: true } },
    { path: "/app/profile/edit", component: () => import("./views/ProfileEditView.vue"), meta: { private: true } },
    { path: "/app/plans", component: () => import("./views/PlansDemoView.vue"), meta: { private: true } },
    { path: "/app/welcome", component: () => import("./views/PilotWelcomeView.vue"), meta: { private: true } },
    { path: "/app/settings", component: SettingsView, meta: { private: true } },
    {
      path: "/app/reports/:reportId",
      name: "report-reader",
      component: ReportReaderView,
      meta: { private: true, reader: true },
    },
    {
      path: "/app/reports/:reportId/print",
      name: "report-print",
      component: ReportReaderView,
      meta: { private: true, reader: true },
    },
    {
      path: "/app/comparison",
      name: "comparison-report",
      component: ReportReaderView,
      meta: { private: true, reader: true },
    },
    {
      path: "/app/demos/:demoKey?",
      component: DemoView,
      meta: { private: true },
    },
    {
      path: "/app/review-previews/:taskVersionId?",
      component: PreviewView,
      meta: { private: true },
    },
    {
      path: "/app/runs/:runId",
      component: WorkspaceView,
      meta: { private: true, workspace: true },
    },
    {
      path: "/app/experiences/:major",
      component: FormalIntroductionView,
      meta: { private: true },
    },
    { path: "/:pathMatch(.*)*", component: NotFoundView },
  ],
});
router.beforeEach(async (to) => {
  if(pilotMode&&["/register","/forgot-password","/verify-email","/reset-password","/change-email","/p0"].includes(to.path))return "/login";
  if(pilotMode&&(to.path.startsWith("/intake/")||to.path==="/recommendation"))return "/app/welcome";
  if(!pilotMode&&to.path==="/app/welcome")return "/app";
  document.title =
    to.path === "/p0"
      ? "MajorPilot · P0 技术验证"
      : "MajorPilot · 找到你的专业探索第一站";
  if (to.meta.private) {
    const auth = useAuth(pinia);
    try {
      await auth.refresh(true);
      if (!auth.me) return { path: "/login", query: { returnTo: to.path } };
      if(pilotMode&&!auth.me.canStartExperience&&to.path!=="/app/welcome"&&to.path!=="/app/settings")return "/app/welcome";
    } catch {
      /* Private view presents retry, not fake data. */
    }
  }
});
const app = createApp(App).use(pinia).use(router);
void router.isReady().then(() => app.mount("#app"));
