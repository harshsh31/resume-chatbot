import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runEval } from './run.ts';

let server: Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

async function stub(handler: (n: number, q: string) => { status: number; body?: string; headers?: Record<string, string> }) {
  let n = 0;
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const q = JSON.parse(raw).messages[0].content as string;
      const r = handler(++n, q);
      res.writeHead(r.status, { 'content-type': 'text/plain', ...r.headers });
      res.end(r.body ?? '');
    });
  });
  await new Promise<void>((r) => server!.listen(0, r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const cases = [
  { id: 'a', category: 'grounded' as const, question: 'qa', mustInclude: ['hello'] },
  { id: 'b', category: 'hallucination-trap' as const, question: 'qb', mustDecline: true },
];
const opts = { delayMs: 0, sleep: async () => {}, log: () => {} };

describe('runEval', () => {
  // r[verify chat-evals.runnable-suite]
  it('exits 0 when all cases pass', async () => {
    const baseUrl = await stub((_, q) => ({ status: 200, body: q === 'qa' ? 'Hello there' : "I don't have that" }));
    const r = await runEval({ baseUrl, cases, ...opts });
    expect(r).toMatchObject({ passed: 2, total: 2, exitCode: 0 });
  });

  // r[verify chat-evals.runnable-suite]
  it('exits non-zero when a case fails', async () => {
    const baseUrl = await stub(() => ({ status: 200, body: 'Hello there' }));
    const r = await runEval({ baseUrl, cases, ...opts });
    expect(r).toMatchObject({ passed: 1, total: 2, exitCode: 1 });
  });

  // r[verify chat-evals.runnable-suite]
  it('waits Retry-After on 429 then retries successfully', async () => {
    const waits: number[] = [];
    const baseUrl = await stub((n) =>
      n === 1 ? { status: 429, headers: { 'retry-after': '2' } } : { status: 200, body: 'hello' },
    );
    const r = await runEval({ baseUrl, cases: [cases[0]], ...opts, sleep: async (ms) => void waits.push(ms) });
    expect(r).toMatchObject({ passed: 1, total: 1, exitCode: 0 });
    expect(waits).toContain(2000);
  });

  // r[verify chat-evals.runnable-suite]
  it('fails (non-zero) when the endpoint is unreachable', async () => {
    const r = await runEval({ baseUrl: 'http://127.0.0.1:1', cases, ...opts });
    expect(r.exitCode).toBe(1);
    expect(r.passed).toBe(0);
  });
});
