# Evals

Runs the cases in `cases.json` against a live `/api/chat` endpoint and prints PASS/FAIL per case plus `N/M passed`. Exits non-zero on any failure or if the endpoint is unreachable.

## Run

```bash
npm run dev     # terminal 1 (needs ANTHROPIC_API_KEY in .env.local)
npm run eval    # terminal 2
```

Set `EVAL_BASE_URL` to target another deployment (default `http://localhost:3000`).

The endpoint allows 10 requests/minute per IP, so the runner is sequential, waits ~6.5s between cases and honours `Retry-After` on 429. A full run takes about 2 minutes.

## Update after the real CV lands

`content/about.md` is currently a placeholder, so the grounded cases only use loose `mustNotInclude` checks. Once the real CV replaces it, add `mustInclude` checks with real facts (employers, projects, skills, contact) to each grounded case, and update the hallucination-trap names if any collide with real employers.

Checks (`checks.ts`): `mustInclude`, `mustNotInclude` (case-insensitive) and `mustDecline` (reply contains a decline phrase). They are string-based and can be brittle; read failures manually.
