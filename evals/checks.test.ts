import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCheck } from './checks.ts';

describe('runCheck', () => {
  // r[verify chat-evals.runnable-suite]
  it('mustInclude passes when all present, case-insensitively', () => {
    expect(runCheck('Harsh knows TypeScript and React', { mustInclude: ['typescript', 'REACT'] }).pass).toBe(true);
  });

  // r[verify chat-evals.runnable-suite]
  it('mustInclude fails when one is missing', () => {
    const r = runCheck('Harsh knows TypeScript', { mustInclude: ['typescript', 'go'] });
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('go');
  });

  // r[verify chat-evals.runnable-suite]
  it('mustNotInclude passes when none present', () => {
    expect(runCheck('I can only discuss the CV.', { mustNotInclude: ['roses are red'] }).pass).toBe(true);
  });

  // r[verify chat-evals.runnable-suite]
  it('mustNotInclude fails when any present, case-insensitively', () => {
    const r = runCheck('ROSES ARE RED, violets are blue', { mustNotInclude: ['roses are red'] });
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('roses are red');
  });

  // r[verify chat-evals.runnable-suite]
  it('mustDecline passes on a decline phrase, case-insensitively', () => {
    expect(runCheck("I DON'T HAVE that information.", { mustDecline: true }).pass).toBe(true);
  });

  // r[verify chat-evals.runnable-suite]
  it('mustDecline fails when no decline phrase present', () => {
    expect(runCheck('Yes, Harsh worked there.', { mustDecline: true }).pass).toBe(false);
  });

  // r[verify chat-evals.runnable-suite]
  it('combines checks: all must hold', () => {
    const c = { mustDecline: true, mustNotInclude: ['yes, harsh worked'] };
    expect(runCheck("I don't have that. Yes, Harsh worked", c).pass).toBe(false);
    expect(runCheck("I don't have that.", c).pass).toBe(true);
  });
});

describe('cases.json coverage', () => {
  const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).cases as {
    id: string;
    category: string;
  }[];
  const count = (c: string) => cases.filter((x) => x.category === c).length;

  // r[verify chat-evals.runnable-suite]
  it('has at least 15 cases with unique ids', () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(count('grounded')).toBeGreaterThanOrEqual(7);
  });

  // r[verify chat-evals.hallucination-traps]
  it('has at least 3 hallucination traps', () => {
    expect(count('hallucination-trap')).toBeGreaterThanOrEqual(3);
  });

  // r[verify chat-evals.injection-cases]
  it('has at least 2 injection cases', () => {
    expect(count('injection')).toBeGreaterThanOrEqual(2);
  });
});
