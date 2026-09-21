import { onBeforeUnmount, onDeactivated } from 'vue'
import useUserStore from '@/store/modules/user'
export function allowed(permission: string) {
  const values = useUserStore().permissions
  return values.includes('*:*:*') || values.includes('majorpilot:' + permission)
}
/** Cache/deactivation and logout are both disposal boundaries for sensitive data. */
export function useOperationsScope(clear: () => void) {
  let generation = 0, controller = new AbortController()
  const cancel = () => { generation += 1; controller.abort(); controller = new AbortController(); clear() }
  window.addEventListener('mp:operator-cleared', cancel)
  onDeactivated(cancel)
  onBeforeUnmount(() => { cancel(); window.removeEventListener('mp:operator-cleared', cancel) })
  return { cancel, ticket() {
    const issued = generation, signal = controller.signal
    return { signal, current: () => issued === generation && !signal.aborted }
  } }
}
