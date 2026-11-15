// A tiny in-memory cache with an expiry time (TTL) and a size limit.
// On Vercel each server instance has its own memory, and instances come and go,
// so this only saves work while an instance stays warm. That's fine: it's a
// free bonus on top of the browser cache, not something we rely on.

type Entry<T> = { value: T; expires: number };

export class MemoryCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(
    private ttlMs: number,
    private maxEntries = 200,
    private now: () => number = Date.now, // injectable for tests
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.delete(key); // re-insert so it counts as newest
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
    // Map keeps insertion order, so the first key is the oldest one.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string;
      this.store.delete(oldest);
    }
  }

  get size(): number {
    return this.store.size;
  }
}
