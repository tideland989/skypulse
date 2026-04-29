#!/usr/bin/env tsx
// Black-box runner: hits one live service, asserts each case. Same suite
// runs against the Python original and the Node port; both must pass.
import { cases, type Case } from './cases.js';

const BASE_URL = process.env.CONFORMANCE_BASE_URL ?? 'http://localhost:3000';

console.log(`Conformance suite`);
console.log(`  BASE_URL = ${BASE_URL}`);
console.log('');

interface Failure {
  case: Case;
  err: unknown;
}
const failures: Failure[] = [];
let pass = 0;

for (const c of cases) {
  try {
    const res = await fetch(BASE_URL + c.request.path);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text === '' ? null : JSON.parse(text);
    } catch {
      // Leave body as the raw text — the assertion will likely fail and surface it.
    }
    c.assert({ status: res.status, body, headers: res.headers });
    pass++;
    console.log(`  PASS  ${c.name}`);
  } catch (err) {
    failures.push({ case: c, err });
    console.log(`  FAIL  ${c.name}`);
  }
}

console.log('');
console.log(`${pass} passed, ${failures.length} failed (${cases.length} total)`);

if (failures.length > 0) {
  console.log('');
  console.log('--- failures ---');
  for (const f of failures) {
    console.log('');
    console.log(`  ${f.case.name}`);
    console.log(`  python ref: ${f.case.pythonRef}`);
    console.log(`  request:    GET ${f.case.request.path}`);
    if (f.err instanceof Error) {
      console.log(`  error:      ${f.err.message}`);
    } else {
      console.log(`  error:      ${String(f.err)}`);
    }
  }
  process.exit(1);
}
