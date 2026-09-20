import { getCurrentInstance } from 'vue'

/** Global helpers are available only while a mounted component is being set up. */
export function useAdminProxy() {
  const proxy = getCurrentInstance()?.proxy
  if (!proxy) throw new Error('Admin helpers require an active component setup context')
  return proxy
}
