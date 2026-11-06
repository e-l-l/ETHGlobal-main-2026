/** In-memory "seen proof identifier" set with TTL. Single-instance only (see README: known gaps). */
export class ReplayCache {
  #seen = new Map<string, number>();
  constructor(private ttlMs: number, private now: () => number = Date.now, private maxEntries = 100_000) {}

  /** Atomically (JS is single-threaded; call with no await in between) checks and records `id`. */
  claim(id: string): boolean {
    const t = this.now();
    const key = id.toLowerCase();
    const exp = this.#seen.get(key);
    if (exp !== undefined && exp > t) return false;
    if (this.#seen.size >= this.maxEntries) this.sweep(t);
    if (this.#seen.size >= this.maxEntries) return false; // fail closed under flood
    this.#seen.set(key, t + this.ttlMs);
    return true;
  }

  sweep(t = this.now()) {
    for (const [k, exp] of this.#seen) if (exp <= t) this.#seen.delete(k);
  }

  get size() {
    return this.#seen.size;
  }
}
