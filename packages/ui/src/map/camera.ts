export const cameraScale = (base: number, zoom: number) => base * zoom;
export function cameraPosition(
  width: number,
  height: number,
  scale: number,
  pan: { x: number; y: number },
) {
  return {
    x: (width - 800 * scale) / 2 + pan.x,
    y: (height - 590 * scale) / 2 + pan.y,
  };
}
export function screenToGround(
  point: { x: number; y: number },
  position: { x: number; y: number },
  scale: number,
) {
  return {
    x: (point.x - position.x) / scale,
    y: (point.y - position.y) / scale,
  };
}
export function nearSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  radius = 7,
) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const ratio = length
    ? Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length),
      )
    : 0;
  return (
    Math.hypot(point.x - a.x - ratio * dx, point.y - a.y - ratio * dy) <= radius
  );
}
// At most one outstanding frame, no recursive callback or permanent ticker.
export function invalidator(
  request: (callback: () => void) => number,
  cancel: (id: number) => void,
  draw: () => void,
) {
  let pending: number | undefined,
    disposed = false,
    generation = 0;
  return {
    flush() {
      if (disposed) return;
      generation++;
      if (pending !== undefined) cancel(pending);
      pending = undefined;
      draw();
    },
    request() {
      if (!disposed && pending === undefined) {
        const current = ++generation;
        pending = request(() => {
          if (current !== generation) return;
          pending = undefined;
          if (!disposed) draw();
        });
      }
    },
    dispose() {
      disposed = true;
      generation++;
      if (pending !== undefined) cancel(pending);
      pending = undefined;
    },
  };
}
