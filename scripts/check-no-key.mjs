// r[verify abuse-protection.key-stays-server-side]
// Run after `next build` with the same dummy key: fails if the key name or value is in client assets.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = ".next/static";
const needles = ["ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY].filter(Boolean);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("check-no-key: set ANTHROPIC_API_KEY to a dummy value so its value can be searched for");
  process.exit(2);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

let scanned = 0;
const hits = [];
for (const f of files(DIR)) {
  scanned++;
  const text = readFileSync(f, "utf8");
  for (const n of needles) if (text.includes(n)) hits.push(`${f} contains ${n === "ANTHROPIC_API_KEY" ? n : "the key value"}`);
}
if (scanned === 0) {
  console.error(`check-no-key: no files under ${DIR}; did the build run?`);
  process.exit(2);
}
if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log(`check-no-key: OK (${scanned} client files scanned, no key name or value found)`);
