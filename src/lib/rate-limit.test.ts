import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

function setup() {
  let t = 1_000_000;
  const limiter = createRateLimiter({
    limit: 10,
    windowMs: 60_000,
    now: () => t,
  });
  return { limiter, advance: (ms: number) => (t += ms) };
}

describe("createRateLimiter", () => {
  // r[verify abuse-protection.rate-limits-per-ip]
  it("allows 10 requests and blocks the 11th with a retry-after", () => {
    const { limiter } = setup();
    for (let i = 0; i < 10; i++)
      expect(limiter.check("1.1.1.1").allowed).toBe(true);
    const r = limiter.check("1.1.1.1");
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
    expect(r.retryAfterSec).toBeLessThanOrEqual(60);
  });

  // r[verify abuse-protection.rate-limits-per-ip]
  it("tracks IPs independently", () => {
    const { limiter } = setup();
    for (let i = 0; i < 10; i++) limiter.check("1.1.1.1");
    expect(limiter.check("1.1.1.1").allowed).toBe(false);
    expect(limiter.check("2.2.2.2").allowed).toBe(true);
  });

  // r[verify abuse-protection.rate-limits-per-ip]
  it("accepts requests again after the window passes", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 11; i++) limiter.check("1.1.1.1");
    expect(limiter.check("1.1.1.1").allowed).toBe(false);
    advance(60_000);
    expect(limiter.check("1.1.1.1").allowed).toBe(true);
  });

  // r[verify abuse-protection.rate-limits-per-ip]
  it("prunes expired entries so the map cannot grow unbounded", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 50; i++) limiter.check(`10.0.0.${i}`);
    expect(limiter.size()).toBe(50);
    advance(60_000);
    limiter.check("9.9.9.9");
    expect(limiter.size()).toBe(1);
  });
});
