/** FIFO-bounded set van geziene IDs voor exclude/dedup in infinite feeds. */
export class BoundedSeenIds {
  private order: string[] = [];
  private set = new Set<string>();

  constructor(private readonly maxSize: number) {}

  reset(): void {
    this.order = [];
    this.set.clear();
  }

  add(id: string): void {
    if (!id || this.set.has(id)) {
      return;
    }
    this.order.push(id);
    this.set.add(id);
    while (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      if (oldest) {
        this.set.delete(oldest);
      }
    }
  }

  addMany(ids: readonly string[]): void {
    for (const id of ids) {
      this.add(id);
    }
  }

  has(id: string): boolean {
    return this.set.has(id);
  }

  size(): number {
    return this.order.length;
  }

  toArray(): string[] {
    return [...this.order];
  }
}

/** Server RPC cap (Reels personalized/explore) — stuur meest recente IDs. */
export function excludeIdsForRpc(seen: BoundedSeenIds, serverCap = 200): string[] {
  const arr = seen.toArray();
  if (arr.length <= serverCap) {
    return arr;
  }
  return arr.slice(arr.length - serverCap);
}

/** Begrens een gewone Set (bijv. analytics) met FIFO. */
export function addToBoundedSet(set: Set<string>, order: string[], id: string, max: number): void {
  if (!id || set.has(id)) {
    return;
  }
  set.add(id);
  order.push(id);
  while (order.length > max) {
    const oldest = order.shift();
    if (oldest) {
      set.delete(oldest);
    }
  }
}
