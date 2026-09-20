import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'

const source = readFileSync(new URL('../worker.js', import.meta.url), 'utf8')
test('reviewed manifest pins the exact worker asset', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))
  assert.equal(createHash('sha256').update(source).digest('hex'),manifest.workerSha256)
  assert.equal(manifest.engine,'fixed-calculator-v1')
})
async function execute(data) {
  let result
  const self = {postMessage: value => {result = value}}
  const context = vm.createContext({self, TextEncoder})
  new vm.Script(source).runInContext(context)
  await self.onmessage({data})
  return JSON.parse(JSON.stringify(result))
}
test('fixed calculator varies with valid input', async () => {
  assert.equal((await execute({template: 'summary-v1', values: [2, 4]})).result.mean, 3)
  assert.equal((await execute({template: 'summary-v1', values: [4, 8]})).result.mean, 6)
})
test('reject source injection, unknown template, oversized values and output', async () => {
  assert.equal((await execute({template: 'summary-v1', values: [2], code: 'fetch(1)'})).status, 'ERROR')
  assert.equal((await execute({template: 'unknown', values: [2]})).code, 'UNKNOWN_TEMPLATE')
  assert.equal((await execute({template: 'summary-v1', values: Array(10001).fill(1)})).code, 'INVALID_PARAMETERS')
  assert.equal((await execute({template: 'summary-v1', values: Array(150000).fill(123456789)})).code, 'INPUT_LIMIT_OR_SCHEMA')
  assert.equal((await execute({template: 'summary-v1', values: [Infinity]})).code, 'INVALID_PARAMETERS')
  assert.equal((await execute({template: 'output-limit-probe-v1', values: [1]})).code, 'OUTPUT_LIMIT')
})
