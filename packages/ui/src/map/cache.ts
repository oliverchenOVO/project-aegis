import type { Detail } from "./theme";
// Three visual detail levels bound memory. Received knowledge is never cached here.
export class CityGeometryCache<T> {
  private key = "";
  private values = new Map<Detail, T>();
  constructor(private destroy: (value: T) => void) {}
  get(key: string, detail: Detail, build: () => T) {
    if (this.key !== key) {
      this.clear();
      this.key = key;
    }
    let value = this.values.get(detail);
    if (value === undefined) {
      value = build();
      this.values.set(detail, value);
    }
    return value;
  }
  clear() {
    for (const value of this.values.values()) this.destroy(value);
    this.values.clear();
    this.key = "";
  }
}
