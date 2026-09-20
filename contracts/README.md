# P0 contracts

`openapi-p0.json` is an OpenAPI 3.1 contract for **synthetic, loopback-only** identity, persistence and Cookie probes. It does not implement P1 registration, real student passwords, or P7 deletion. Probe routes are enabled only by the `p0` Spring profile. The RuoYi operator-auth failure envelope remains upstream-specific and is declared separately.

`schemas/p0-ai-result.schema.json` is a small synthetic AI response contract. It is not the future experience-report schema. Even when provider JSON Schema mode is accepted, local structural and evidence/boundary checks remain mandatory.

From the repository root:

```sh
data/tools/node/bin/node data/tools/npm/bin/npm-cli.js ci --prefix contracts
data/tools/node/bin/node contracts/check.mjs
data/tools/node/bin/node --test contracts/tests/*.test.mjs scripts/ai-spike.test.mjs
```

The checks validate OpenAPI syntax, schema compilation, path inventory against Spring annotations, request/response negative fixtures and security declarations. They do **not** prove that a running HTTP server enforces the contract. Runtime and real-browser evidence is recorded separately in the P0 implementation handoff.
