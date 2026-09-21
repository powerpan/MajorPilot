const PREFIX = "mp:feedback-comment:v1:";
export const FEEDBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let owner: string | null = null;
function key(studentId: string, versionId: string) {
  return PREFIX + JSON.stringify([studentId, "REPORT_VERSION", versionId]);
}
interface CommentDraft {
  owner: string;
  versionId: string;
  comment: string;
  expiresAt: number;
}
function keys() {
  return Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  ).filter((value): value is string => !!value && value.startsWith(PREFIX));
}
export function lockFeedbackDrafts() {
  owner = null;
}
export function purgeFeedbackDrafts() {
  lockFeedbackDrafts();
  for (const value of keys()) localStorage.removeItem(value);
}
export function verifyFeedbackOwner(studentId: string) {
  owner = null;
  for (const value of keys()) {
    try {
      const draft = JSON.parse(
        localStorage.getItem(value) || "null",
      ) as CommentDraft | null;
      if (!draft || draft.owner !== studentId || draft.expiresAt <= Date.now())
        localStorage.removeItem(value);
    } catch {
      localStorage.removeItem(value);
    }
  }
  owner = studentId;
}
function assertOwner(studentId: string) {
  if (owner !== studentId)
    throw new Error("请先验证登录状态，才能恢复本账户反馈草稿。");
}
export function readFeedbackDraft(studentId: string, versionId: string) {
  assertOwner(studentId);
  try {
    const value = JSON.parse(
      localStorage.getItem(key(studentId, versionId)) || "null",
    ) as CommentDraft | null;
    if (
      !value ||
      value.owner !== studentId ||
      value.versionId !== versionId ||
      value.expiresAt <= Date.now() ||
      typeof value.comment !== "string" ||
      [...value.comment].length > 1000
    ) {
      localStorage.removeItem(key(studentId, versionId));
      return "";
    }
    return value.comment;
  } catch {
    localStorage.removeItem(key(studentId, versionId));
    return "";
  }
}
export function writeFeedbackDraft(
  studentId: string,
  versionId: string,
  comment: string,
) {
  assertOwner(studentId);
  if ([...comment].length > 1000)
    throw new Error("评论最多1000字，未覆盖原草稿。");
  if (!comment) {
    localStorage.removeItem(key(studentId, versionId));
    return;
  }
  localStorage.setItem(
    key(studentId, versionId),
    JSON.stringify({
      owner: studentId,
      versionId,
      comment,
      expiresAt: Date.now() + FEEDBACK_TTL_MS,
    } satisfies CommentDraft),
  );
}
export function removeFeedbackDraft(studentId: string, versionId: string) {
  assertOwner(studentId);
  localStorage.removeItem(key(studentId, versionId));
}
export function hasFeedbackDrafts() {
  return keys().some((value) => {
    try {
      return (
        JSON.parse(localStorage.getItem(value) || "null")?.expiresAt >
        Date.now()
      );
    } catch {
      return false;
    }
  });
}
window.addEventListener("mp:identity-cleared", (event) => {
  lockFeedbackDrafts();
  const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
  if (reason === "LOGOUT") {
    try {
      purgeFeedbackDrafts();
    } catch {
      /* Locked even when browser storage is denied. */
    }
  }
});
