import { ClampToEdgeWrapping, type Texture } from "three";

const MAP = 64;

export function sampleEnergy(source: CanvasImageSource): Float32Array | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = MAP;
    canvas.height = MAP;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, MAP, MAP);
    const { data } = ctx.getImageData(0, 0, MAP, MAP);
    const lum = new Float32Array(MAP * MAP);
    const energy = new Float32Array(MAP * MAP);
    for (let i = 0; i < MAP * MAP; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      energy[i] = max === 0 ? 0 : ((max - min) / max) * 48;
    }
    for (let y = 1; y < MAP - 1; y++) {
      for (let x = 1; x < MAP - 1; x++) {
        const i = y * MAP + x;
        const gx =
          -lum[i - MAP - 1] +
          lum[i - MAP + 1] -
          2 * lum[i - 1] +
          2 * lum[i + 1] -
          lum[i + MAP - 1] +
          lum[i + MAP + 1];
        const gy =
          -lum[i - MAP - 1] -
          2 * lum[i - MAP] -
          lum[i - MAP + 1] +
          lum[i + MAP - 1] +
          2 * lum[i + MAP] +
          lum[i + MAP + 1];
        energy[i] += Math.hypot(gx, gy);
      }
    }
    return energy;
  } catch {
    return null;
  }
}

export function coverUv(
  imageAspect: number,
  panelAspect: number,
  energy: Float32Array | null,
): { offsetX: number; offsetY: number; repeatX: number; repeatY: number } {
  const img = imageAspect > 0 ? imageAspect : 1;
  const panel = panelAspect > 0 ? panelAspect : 1;
  const repeatX = img > panel ? panel / img : 1;
  const repeatY = img < panel ? img / panel : 1;
  if (!energy || energy.length !== MAP * MAP) {
    return {
      offsetX: (1 - repeatX) / 2,
      offsetY: (1 - repeatY) / 2,
      repeatX,
      repeatY,
    };
  }

  const winW = Math.max(1, Math.round(repeatX * MAP));
  const winH = Math.max(1, Math.round(repeatY * MAP));
  const maxX = MAP - winW;
  const maxY = MAP - winH;
  const sat = integral(energy);
  let best = -Infinity;
  let bestX = maxX / 2;
  let bestY = maxY / 2;

  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= maxX; x++) {
      const cx = (x + winW * 0.5) / MAP - 0.5;
      const cy = (y + winH * 0.5) / MAP - 0.5;
      const center = 1 - (cx * cx + cy * cy) * 2;
      const score = box(sat, x, y, winW, winH) * center;
      if (score > best) {
        best = score;
        bestX = x;
        bestY = y;
      }
    }
  }

  return {
    offsetX: maxX <= 0 ? 0 : (bestX / maxX) * (1 - repeatX),
    // ImageData y=0 is the top of the photo; Three.js UV y=0 is the bottom.
    offsetY: maxY <= 0 ? 0 : (1 - bestY / maxY) * (1 - repeatY),
    repeatX,
    repeatY,
  };
}

export function applyCoverFit(
  texture: Texture,
  imageAspect: number,
  panelAspect: number,
  energy: Float32Array | null,
): void {
  const uv = coverUv(imageAspect, panelAspect, energy);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.repeat.set(uv.repeatX, uv.repeatY);
  texture.offset.set(uv.offsetX, uv.offsetY);
}

function integral(energy: Float32Array): Float32Array {
  const s = MAP + 1;
  const sat = new Float32Array(s * s);
  for (let y = 1; y <= MAP; y++) {
    let row = 0;
    for (let x = 1; x <= MAP; x++) {
      row += energy[(y - 1) * MAP + (x - 1)];
      sat[y * s + x] = sat[(y - 1) * s + x] + row;
    }
  }
  return sat;
}

function box(
  sat: Float32Array,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const s = MAP + 1;
  const x2 = x + w;
  const y2 = y + h;
  return sat[y2 * s + x2] - sat[y * s + x2] - sat[y2 * s + x] + sat[y * s + x];
}
