type Point = readonly [number, number];
type Triangle = readonly [Point, Point, Point];

// The display's four corners in the 1536 x 1024 device artwork. The source
// capture uses a 900 x 562 plane before projection into that quadrilateral.
export const screenOutline = '550,166 1395,91 1377,673 485,648';

function project([x, y]: Point): Point {
  const w = 1 - .000188234574601623 * x - .0000998384216135245 * y;
  return [(.676301657319625 * x - .164079997471883 * y + 550) / w,
    (-.100462679622081 * x + .792955948346037 * y + 166) / w];
}

function affine(source: Triangle, target: Triangle): string {
  const [p, q, r] = source;
  const [a, b, c] = target;
  const qx = q[0] - p[0], qy = q[1] - p[1];
  const rx = r[0] - p[0], ry = r[1] - p[1];
  const determinant = qx * ry - rx * qy;
  const ax = ((b[0] - a[0]) * ry - (c[0] - a[0]) * qy) / determinant;
  const ay = ((b[1] - a[1]) * ry - (c[1] - a[1]) * qy) / determinant;
  const bx = ((c[0] - a[0]) * qx - (b[0] - a[0]) * rx) / determinant;
  const by = ((c[1] - a[1]) * qx - (b[1] - a[1]) * rx) / determinant;
  const tx = a[0] - ax * p[0] - bx * p[1];
  const ty = a[1] - ay * p[0] - by * p[1];
  return `matrix(${[ax, ay, bx, by, tx, ty].map((n) => n.toFixed(7)).join(' ')})`;
}

function clipPoints(triangle: Triangle): string {
  const center = triangle.reduce<Point>((sum, point) => [sum[0] + point[0] / 3, sum[1] + point[1] / 3], [0, 0]);
  // Keep at least half a device pixel of overlap even at the 320px mobile
  // layout. The outer bezel clip contains this antialiasing seam allowance.
  return triangle.map(([x, y]) => {
    const dx = x - center[0], dy = y - center[1];
    const padding = 2.5 / Math.hypot(dx, dy);
    return `${(x + dx * padding).toFixed(4)},${(y + dy * padding).toFixed(4)}`;
  }).join(' ');
}

// This runs at build time. SVG's ordinary 2D transforms avoid WebKit's
// inconsistent painting of CSS matrix3d() projective W coordinates.
export function buildScreenMesh() {
  const mesh: { points: string; transform: string }[] = [];
  const columns = 12, rows = 8;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = column * 900 / columns, y = row * 562 / rows;
    const nextX = (column + 1) * 900 / columns, nextY = (row + 1) * 562 / rows;
    const triangles: Triangle[] = [[[x, y], [nextX, y], [nextX, nextY]], [[x, y], [nextX, nextY], [x, nextY]]];
    for (const source of triangles) {
      const target: Triangle = [project(source[0]), project(source[1]), project(source[2])];
      mesh.push({ points: clipPoints(target), transform: affine(source, target) });
    }
  }
  return mesh;
}
