# P0 restricted execution experiment

This is a **trusted fixed-calculator fallback**, not a Python IDE and not a general-purpose JavaScript sandbox. Only a versioned template identifier and bounded numeric parameters are accepted. The student app shows equivalent **read-only** Python; it never concatenates user text into executable code.

Run `node server.mjs` on `127.0.0.1:15175`; parent is exactly `http://localhost:15173`. The launcher verifies the worker against the committed `manifest.json` SHA-256, embeds it, and the browser checks the hash again before each run. Asset changes require an explicit manifest review/update. A sandboxed opaque-origin iframe (`allow-scripts`, no `allow-same-origin`) creates a disposable blob Worker. The Worker inherits `connect-src 'none'`; it receives no business credentials, private data, file handles, or storage access. The launcher rejects unexpected Host values and routes and never sets a Cookie.

Opaque origins require parent-to-frame `postMessage` target `*`; this does **not** broadcast to all windows. Only this iframe's window receives public parameters. The receiver validates the exact parent Origin, source window, message type, and a per-execution random nonce. The parent accepts `origin === 'null'` only together with the exact iframe window, response type, and its current nonce. Parent deadlines remove the frame; frame deadlines terminate the Worker. New execution never reuses the prior Worker.

Limits: 1 MiB encoded input, 10,000 finite numbers with absolute value at most 1e9, 10 seconds, 100 KiB serialized output. There is no portable hard memory quota. Probes are hardcoded P0-only templates, not arbitrary programs. Formal P2/P3 results must still be recomputed/validated by the backend; this page does not claim server-authoritative scoring.

`npm test` checks valid input variation and deterministic rejection. `npm run probe:pyodide` starts a separate **test-only** port 15176 for the real Pyodide candidate. It is not started by normal local startup and must not be deployed. `tests/e2e/pyodide.mjs` measures the upstream loader with boot-time same-origin loading, then proves that the same loader cannot start under compute-time `connect-src 'none'`. This does not prove Pyodide is intrinsically impossible to isolate; a separately reviewed preloaded-asset architecture is deferred. No policy is relaxed to make the candidate pass.

Browser evidence and reproduction commands: [docs/19](../docs/19-p0-browser-execution-spike.md).
