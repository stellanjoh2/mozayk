import { BufferAttribute, PlaneGeometry } from "three";

/** Plane bent onto a cylinder so the inner (concave) face looks at the origin. */
function cylinderVertex(
  x: number,
  y: number,
  radius: number,
  bent: number,
): [number, number, number] {
  const r = Math.max(radius, 0.01);
  if (bent <= 0.001) return [x, y, -r];
  const R = r / bent;
  const theta = x / R;
  return [R * Math.sin(theta), y, -R * Math.cos(theta) + (R - r)];
}

export function createBentPanel(
  width: number,
  height: number,
  radius: number,
  segments = 48,
): PlaneGeometry {
  const geo = new PlaneGeometry(width, height, segments, 1);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = cylinderVertex(pos.getX(i), pos.getY(i), radius, 1);
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 0 = cylinder, 1 = flat plane tangent at the panel center. */
export function bendExisting(
  geo: PlaneGeometry,
  width: number,
  height: number,
  radius: number,
  flatten = 0,
): void {
  const pos = geo.attributes.position as BufferAttribute;
  const hw = width / 2;
  const hh = height / 2;
  const segs = geo.parameters.widthSegments;
  const bent = 1 - Math.max(0, Math.min(1, flatten));

  for (let i = 0; i < pos.count; i++) {
    const col = i % (segs + 1);
    const row = Math.floor(i / (segs + 1));
    const u = segs === 0 ? 0.5 : col / segs;
    const x = -hw + u * width;
    const y = hh - row * height;
    const [bx, by, bz] = cylinderVertex(x, y, radius, bent);
    pos.setXYZ(i, bx, by, bz);
  }

  pos.needsUpdate = true;
}
