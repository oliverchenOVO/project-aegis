export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => JSON.stringify(k) + ":" + canonical(obj[k]))
      .join(",") +
    "}"
  );
}
export function hash(value: unknown): string {
  const s = typeof value === "string" ? value : canonical(value);
  let a = 2166136261,
    b = 2246822519;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b ^ s.charCodeAt(i), 3266489917);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
export function clock(tick: number): string {
  return `${String(14 + Math.floor(tick / 3600)).padStart(2, "0")}:${String(Math.floor(tick / 60) % 60).padStart(2, "0")}:${String(tick % 60).padStart(2, "0")}`;
}
