interface ApiErrorBody {
  code?: string;
  message?: string;
  fieldErrors?: { field?: string; message?: string }[];
  details?: { currentRevision?: number };
}
const messages: Record<string, string> = {
  AUTH_REQUIRED:
    "登录状态已失效，或这份填写凭证已失效。请登录恢复已保存的资料。",
  SESSION_EXPIRED: "登录已过期，请重新登录。",
  AUTH_INVALID: "邮箱或密码不正确，请检查后重试。",
  IDENTITY_CHANGED:
    "会话已在其他页面更新。请重新进入当前页面，旧请求不会继续保存资料。",
  CSRF_INVALID: "安全凭证已更新，请重试本次操作。",
  EMAIL_NOT_VERIFIED: "请先验证邮箱，你填写的资料已保存。",
  ACCOUNT_LOCKED: "当前账户暂时无法使用，请稍后再试。",
  EMAIL_ALREADY_REGISTERED: "这个邮箱已注册，可以登录继续。",
  INTAKE_EXPIRED: "这份草稿已超过保留期限。请重新开始填写。",
  INTAKE_ALREADY_CLAIMED: "资料已保存并绑定账户，请登录继续，不需要重新填写。",
  INTAKE_REVISION_CONFLICT:
    "另一页面已保存了较新版本。请选择如何处理，系统不会覆盖你的答案。",
  QUESTIONNAIRE_VERSION_STALE: "问卷版本已更新，请保留本机草稿后重新开始。",
  DECISION_PROFILE_INVALID: "请检查尚未完成或不符合要求的答案。",
  EMAIL_TOKEN_INVALID: "邮件链接无效、已过期或已使用。请重新发送邮件。",
  RATE_LIMITED: "操作较频繁，请稍后重试。",
  RESOURCE_NOT_FOUND: "内容不存在，或当前账户无法访问。",
  REQUEST_IN_PROGRESS: "同一次操作正在处理，请稍后重试。",
  IDEMPOTENCY_KEY_REUSED: "本次请求内容已改变，请重新确认后再提交。",
  CONSENT_REQUIRED: "请阅读并同意使用条款和隐私政策。",
  PASSWORD_INVALID: "密码需要15–128个字符。",
  EMAIL_INVALID: "请输入有效邮箱。",
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public fields: ApiErrorBody["fieldErrors"] = [],
    public currentRevision?: number,
  ) {
    super(
      messages[code] ||
        (status === 429
          ? "操作较频繁，请稍后重试。"
          : status >= 500
            ? "服务暂时不可用，输入已保留，请稍后重试。"
            : "本次操作未成功，请检查输入后重试。"),
    );
  }
}
function cookie(name: string) {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export async function csrf(boundary: "public" | "app") {
  await api<{ csrfToken: string }>(`/api/${boundary}/v1/auth/csrf`);
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  } = {},
  refreshed = false,
): Promise<T> {
  const method = options.method || "GET";
  const boundary = path.startsWith("/api/app/") ? "app" : "public";
  const unsafe = !["GET", "HEAD"].includes(method);
  if (unsafe && !cookie(boundary === "app" ? "MP_CSRF" : "MP_PUBLIC_CSRF"))
    await csrf(boundary);
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      headers: {
        ...(unsafe
          ? {
              "Content-Type": "application/json",
              "X-CSRF-Token": cookie(
                boundary === "app" ? "MP_CSRF" : "MP_PUBLIC_CSRF",
              ),
            }
          : {}),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiError(0, "NETWORK_UNAVAILABLE");
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: ApiErrorBody;
  };
  if (!response.ok) {
    if (payload.error?.code === "CSRF_INVALID" && unsafe && !refreshed) {
      await csrf(boundary);
      return api<T>(path, options, true);
    }
    throw new ApiError(
      response.status,
      payload.error?.code || "REQUEST_FAILED",
      payload.error?.fieldErrors,
      payload.error?.details?.currentRevision,
    );
  }
  return payload.data as T;
}
export function errorText(cause: unknown) {
  return cause instanceof ApiError && cause.status === 0
    ? "网络连接中断，输入已保留。连接恢复后可以重试。"
    : cause instanceof Error
      ? cause.message
      : "操作暂未完成，请重试。";
}
export function safeReturn(value: unknown) {
  return typeof value === "string" &&
    /^\/app(?:\/[A-Za-z0-9_/-]*)?$/.test(value)
    ? value
    : "/app";
}
export function stableOperation() {
  let fingerprint = "";
  let key = "";
  return (body: unknown) => {
    const next = JSON.stringify(body);
    if (fingerprint !== next) {
      fingerprint = next;
      key = crypto.randomUUID();
    }
    return key;
  };
}
