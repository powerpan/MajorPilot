// Only reviewed templates enter this Worker. There is no source/eval parameter.
const MAX_INPUT = 1024 * 1024
const MAX_OUTPUT = 100 * 1024
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length

self.onmessage = async ({data}) => {
  const reply = payload => {
    const result = {...payload, engine: 'fixed-calculator-v1'}
    self.postMessage(bytes(result) > MAX_OUTPUT ? {status: 'ERROR', code: 'OUTPUT_LIMIT', engine: 'fixed-calculator-v1'} : result)
  }
  if (!data || Object.keys(data).some(key => !['template', 'values', 'parameters'].includes(key)) || bytes(data) > MAX_INPUT) {
    return reply({status: 'ERROR', code: 'INPUT_LIMIT_OR_SCHEMA'})
  }
  const {template, values} = data
  if (template !== 'demo-summary-v1' && data.parameters !== undefined) return reply({status:'ERROR',code:'INVALID_PARAMETERS'})
  if (!Array.isArray(values) || values.length < 1 || values.length > 10000 || values.some(value => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e9)) {
    return reply({status: 'ERROR', code: 'INVALID_PARAMETERS'})
  }
  if (template === 'summary-v1') {
    const total = values.reduce((sum, value) => sum + value, 0)
    return reply({status: 'SUCCESS', result: {count: values.length, mean: total / values.length, minimum: Math.min(...values), maximum: Math.max(...values)}})
  }
  if (template === 'demo-summary-v1') {
    const params = data.parameters
    if (values.length !== 4 || !params || Object.keys(params).length !== 2 || ![1,2,3].includes(params.multiplier) || !['ALL','FIRST_TWO'].includes(params.include)) return reply({status:'ERROR',code:'INVALID_PARAMETERS'})
    const selected = (params.include === 'FIRST_TWO' ? values.slice(0,2) : values).map(value => value * params.multiplier)
    const sum = selected.reduce((total, value) => total + value, 0)
    return reply({status:'SUCCESS',result:{count:selected.length,sum,mean:sum/selected.length,multiplier:params.multiplier,include:params.include}})
  }
  // P0 probes are fixed reviewed code, never supplied by a user.
  if (template === 'timeout-probe-v1') {while (true) { /* terminated by host after 10 s */ }}
  if (template === 'crash-probe-v1') { setTimeout(() => { throw new Error('Controlled worker recovery probe') }, 0); return }
  if (template === 'output-limit-probe-v1') return reply({status: 'SUCCESS', result: {probe: 'x'.repeat(MAX_OUTPUT + 1)}})
  if (template === 'isolation-probe-v1') {
    const violations = []
    self.addEventListener('securitypolicyviolation', event => violations.push(event.effectiveDirective))
    let networkBlocked = false, fileUrlBlocked = false, indexedDbBlocked = false, opfsBlocked = false, webSocketBlocked = false
    try {await fetch('http://localhost:18080/api/app/v1/p0/whoami')} catch {networkBlocked = true}
    try {await fetch('file:///etc/passwd')} catch {fileUrlBlocked = true}
    try {
      await new Promise((resolve, reject) => {
        const socket = new WebSocket('ws://localhost:18080/p0-probe')
        socket.onerror = reject
        socket.onopen = () => {socket.close(); resolve(true)}
      })
    } catch {webSocketBlocked = true}
    try {
      await new Promise((resolve, reject) => {const request = indexedDB.open('mp-isolation-probe'); request.onerror = reject; request.onsuccess = () => {request.result.close(); resolve(true)}})
    } catch {indexedDbBlocked = true}
    try {await navigator.storage.getDirectory()} catch {opfsBlocked = true}
    await new Promise(resolve => setTimeout(resolve, 0))
    return reply({status: 'SUCCESS', result: {networkBlocked, networkBlockedByCsp: violations.filter(value => value === 'connect-src').length >= 3, fileUrlBlocked, indexedDbBlocked, opfsBlocked, webSocketBlocked, filePickerUnavailable: typeof self.showOpenFilePicker === 'undefined', documentUnavailable: typeof document === 'undefined', cookieUnavailable: typeof cookieStore === 'undefined'}})
  }
  reply({status: 'ERROR', code: 'UNKNOWN_TEMPLATE'})
}
