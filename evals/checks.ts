export type Check = { mustInclude?: string[]; mustNotInclude?: string[]; mustDecline?: boolean };
export type CheckResult = { pass: boolean; reason: string };

const DECLINE_PHRASES = [
  "don't have", 'do not have', 'no information', 'not available', "can't find", 'cannot find',
  'not mentioned', "isn't mentioned", 'not something i', 'reach out', 'contact',
];

// Normalise curly apostrophes so "don’t" matches "don't".
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'");

// r[impl chat-evals.runnable-suite]
export function runCheck(reply: string, check: Check): CheckResult {
  const text = norm(reply);
  const missing = (check.mustInclude ?? []).filter((s) => !text.includes(norm(s)));
  if (missing.length) return { pass: false, reason: `missing: ${missing.join(', ')}` };
  const found = (check.mustNotInclude ?? []).filter((s) => text.includes(norm(s)));
  if (found.length) return { pass: false, reason: `forbidden present: ${found.join(', ')}` };
  if (check.mustDecline && !DECLINE_PHRASES.some((p) => text.includes(p)))
    return { pass: false, reason: 'no decline phrase found' };
  return { pass: true, reason: 'ok' };
}
