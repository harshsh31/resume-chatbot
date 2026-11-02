import { readFileSync } from 'node:fs';
import { runCheck, type Check } from './checks.ts';

export type Category = 'grounded' | 'hallucination-trap' | 'injection';
export type EvalCase = Check & { id: string; category: Category; question: string };

// r[impl chat-evals.hallucination-traps]
// r[impl chat-evals.injection-cases]
export function loadCases(): EvalCase[] {
  return JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).cases;
}

type Opts = {
  baseUrl: string;
  cases: EvalCase[];
  delayMs?: number; // throttle between calls: server allows 10 req/min per IP
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

// r[impl chat-evals.runnable-suite]
export async function runEval(o: Opts) {
  const { baseUrl, cases, delayMs = 6500, maxRetries = 3 } = o;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = o.log ?? console.log;
  let passed = 0;

  for (const [i, c] of cases.entries()) {
    if (i > 0) await sleep(delayMs);
    let verdict: { pass: boolean; reason: string };
    try {
      let reply: string | undefined;
      let status = 0;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: c.question }] }),
        });
        status = res.status;
        if (status === 429) {
          await res.text();
          const secs = Number(res.headers.get('retry-after'));
          await sleep((Number.isFinite(secs) && secs > 0 ? secs : 60) * 1000);
          continue;
        }
        if (status === 200) reply = (await res.text()) || undefined; // empty body = upstream failure
        break;
      }
      verdict = reply === undefined ? { pass: false, reason: `HTTP ${status}` } : runCheck(reply, c);
    } catch (e) {
      verdict = { pass: false, reason: `unreachable: ${(e as Error).message}` };
    }
    if (verdict.pass) passed++;
    log(`${verdict.pass ? 'PASS' : 'FAIL'}  ${c.id}  [${c.category}]  ${verdict.reason}`);
  }

  log(`${passed}/${cases.length} passed`);
  return { passed, total: cases.length, exitCode: passed === cases.length ? 0 : 1 };
}

if (import.meta.filename === process.argv[1]) {
  const baseUrl = process.env.EVAL_BASE_URL ?? 'http://localhost:3000';
  runEval({ baseUrl, cases: loadCases() }).then((r) => process.exit(r.exitCode));
}
