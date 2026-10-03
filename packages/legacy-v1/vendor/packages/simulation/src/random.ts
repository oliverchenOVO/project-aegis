import { hash } from "../../shared/src/index";
export class SeededRandom {
  constructor(
    private seed: string,
    private states: Record<string, number>,
    private stream: string,
  ) {}
  next(): number {
    let n =
      this.states[this.stream] ??
      parseInt(hash(`${this.seed}:${this.stream}`).slice(0, 8), 16);
    n = (n + 0x6d2b79f5) >>> 0;
    this.states[this.stream] = n;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  integer(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  choose<T>(items: readonly T[]): T {
    if (!items.length) throw new Error("Empty random choice");
    return items[this.integer(0, items.length - 1)];
  }
}
