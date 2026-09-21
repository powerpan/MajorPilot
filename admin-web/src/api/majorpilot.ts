import { getToken } from '@/utils/auth'
import useUserStore from '@/store/modules/user'
import router from '@/router'

const base = import.meta.env.VITE_APP_BASE_API + '/api/admin/v1/majorpilot'
const pending = new Set<AbortController>()
let identityEpoch = 0
window.addEventListener('mp:operator-cleared', () => {
  identityEpoch += 1
  for (const controller of pending) controller.abort()
  pending.clear()
})
const messages: Record<string, string> = {
  FILTER_CONFLICT: '比较报告不能同时使用单次体验的专业或版本筛选，请清除这些筛选后重试。',
  REVISION_CONFLICT: '记录已改变，请刷新后重新确认，不会覆盖较新状态。',
  IDEMPOTENCY_KEY_REUSED: '同次操作内容已经变化，请重新确认。',
  REQUEST_IN_PROGRESS: '同次操作正在处理中，请稍后重试。',
  EXPORT_TOO_LARGE: '结果超过允许的导出上限，请缩小筛选范围。',
  EXPORT_ROW_LIMIT_EXCEEDED: '超过 10,000 行上限，未生成截断文件。请缩小筛选范围。',
  EXPORT_NOT_AVAILABLE: '文件尚未就绪、已过期或已撤销，请刷新状态。',
  RATE_LIMITED: '操作较频繁，请稍后重试。',
}
export class OperationsError extends Error {
  constructor(public status: number, public code: string) {
    super(messages[code] || (status === 401 ? '管理登录已过期，请重新登录。' : status === 403 ? '当前权限不足。' : status === 404 ? '记录不存在或不可访问。' : status === 409 ? '记录已更新，请刷新后重新确认。' : status === 422 ? '请检查筛选条件或输入内容。' : '操作暂未完成，请稍后重试。'))
  }
}
/** No upstream sessionObj cache, no response logs, no Student cookies. */
export async function operations<T>(path: string, options: {
  method?: string; body?: unknown; query?: object; key?: string; signal?: AbortSignal; blob?: boolean
} = {}): Promise<T> {
  if (!/^\/[A-Za-z0-9/_-]*$/.test(path)) throw new OperationsError(422, 'INVALID_PATH')
  const token = getToken()
  const issuedAt = identityEpoch
  if (!token) throw new OperationsError(401, 'AUTH_REQUIRED')
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(options.query || {}))
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  let response: Response
  const controller = new AbortController()
  pending.add(controller)
  const current = () => getToken() === token && issuedAt === identityEpoch
  try {
  try {
    response = await fetch(base + path + (search.size ? '?' + search : ''), {
      method: options.method || 'GET', credentials: 'omit', cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000), ...(options.signal ? [options.signal] : [])]),
      headers: { Authorization: 'Bearer ' + token, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    })
  } catch { throw new OperationsError(0, 'NETWORK_UNAVAILABLE') }
  if (!current()) throw new OperationsError(409, 'IDENTITY_CHANGED')
  if (response.status === 401) {
    useUserStore().clearIdentity()
    void router.replace('/login')
  }
  if (response.ok && options.blob) {
    const blob = await response.blob()
    if (!current()) throw new OperationsError(409, 'IDENTITY_CHANGED')
    return blob as T
  }
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string } }
  if (!response.ok) throw new OperationsError(response.status, payload.error?.code || 'REQUEST_FAILED')
  if (!current()) throw new OperationsError(409, 'IDENTITY_CHANGED')
  return payload.data as T
  } finally { pending.delete(controller) }
}
export function operationKey() {
  let previous = '', key = ''
  return (body: unknown) => {
    const next = JSON.stringify(body)
    if (next !== previous) { previous = next; key = crypto.randomUUID() }
    return key
  }
}
export function downloadOperationsBlob(blob: Blob) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'majorpilot-analysis.csv'; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
