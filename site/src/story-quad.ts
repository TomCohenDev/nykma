// The CSS transform that warps a w × h box onto four corners (top left, top right, bottom right, bottom left), for
// putting myapp's screen into the phone in the scroll story. The same projective map as ScreenInsert in the ads.
export type Quad = [number, number][];

export function quadMatrix(w: number, h: number, q: Quad): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = det ? (sx * dy2 - dx2 * sy) / det : 0;
  const k = det ? (dx1 * sy - sx * dy1) / det : 0;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const n = (v: number) => +v.toFixed(6);
  return `matrix3d(${[a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1].map(n).join(",")})`;
}
