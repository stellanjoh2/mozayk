import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  GALLERY_SHAPE_PATHS,
  GALLERY_SHAPE_VIEWBOX,
  type GalleryShape,
} from "../shapes/galleryShapes";

/** Eight gallery shapes for the cursor emitter. */
const SHAPES = [
  "clover",
  "dots",
  "spots",
  "arcs",
  "quads",
  "bloom",
  "star",
  "flower",
] as const satisfies readonly GalleryShape[];

/** Default logotype fills — blue / purple / orange / white. */
const LOGO_COLORS = ["#2e1ebc", "#cf41f2", "#ff5300", "#ffffff"] as const;

type EmitterSettings = {
  particleCount: number;
  particleSize: number;
  randomness: number;
  rotationSpeed: number;
  rotationRandomness: number;
  gravity: number;
  blastRadius: number;
  headlineSize: number;
  headlineLineHeight: number;
  headlineButtonGap: number;
  buttonSize: number;
};

const DEFAULT_SETTINGS: EmitterSettings = {
  particleCount: 40,
  particleSize: 150,
  randomness: 1,
  rotationSpeed: 1.9,
  rotationRandomness: 0.87,
  gravity: 2300,
  blastRadius: 480,
  headlineSize: 1.1,
  headlineLineHeight: 0.8,
  headlineButtonGap: 82,
  buttonSize: 1,
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  shape: GalleryShape;
  life: number;
};

type ButtonBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type SimState = {
  particles: Particle[];
  mouseX: number;
  mouseY: number;
  hasMouse: boolean;
  spawnAcc: number;
  width: number;
  height: number;
  dpr: number;
  settings: EmitterSettings;
  button: ButtonBounds | null;
};

function pick<T>(items: readonly T[]): T {
  return items[(Math.random() * items.length) | 0]!;
}

function spawnParticle(state: SimState): Particle {
  const {
    blastRadius,
    rotationSpeed,
    rotationRandomness,
    particleSize,
    randomness,
  } = state.settings;
  const r = Math.max(0, Math.min(1, randomness));
  const rotR = Math.max(0, Math.min(1, rotationRandomness));
  const angle = Math.random() * Math.PI * 2;
  const forceSpread = 0.15 + r * 0.7;
  const force =
    blastRadius * (1 - forceSpread * 0.5 + Math.random() * forceSpread);
  const spinSign = Math.random() < 0.5 ? -1 : 1;
  const maxSpin = 2.5 * rotationSpeed;
  const minSpin = maxSpin * (1 - rotR);
  const spinMag = minSpin + Math.random() * (maxSpin - minSpin);
  const sizeJitter = particleSize * r * 0.85;
  const spawnJitter = 8 * r;
  return {
    x: state.mouseX + (Math.random() * 2 - 1) * spawnJitter,
    y: state.mouseY + (Math.random() * 2 - 1) * spawnJitter,
    vx: Math.cos(angle) * force,
    vy: Math.sin(angle) * force - blastRadius * 0.15,
    rotation: Math.random() * Math.PI * 2,
    spin: spinSign * spinMag,
    size: Math.max(4, particleSize + (Math.random() * 2 - 1) * sizeJitter),
    color: pick(LOGO_COLORS),
    shape: pick(SHAPES),
    life: 0,
  };
}

function collideParticleWithButton(
  p: Particle,
  button: ButtonBounds,
  gravity: number,
): void {
  const r = p.size * 0.38;
  const closestX = Math.max(button.left, Math.min(button.right, p.x));
  const closestY = Math.max(button.top, Math.min(button.bottom, p.y));
  let dx = p.x - closestX;
  let dy = p.y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return;

  let nx: number;
  let ny: number;
  let depth: number;

  if (distSq < 1e-8) {
    // Center inside the rect — push out along the shallowest axis.
    const left = p.x - button.left;
    const right = button.right - p.x;
    const top = p.y - button.top;
    const bottom = button.bottom - p.y;
    const minX = Math.min(left, right);
    const minY = Math.min(top, bottom);
    if (minX < minY) {
      nx = left < right ? -1 : 1;
      ny = 0;
      depth = r + minX;
    } else {
      nx = 0;
      ny = top < bottom ? -1 : 1;
      depth = r + minY;
    }
  } else {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
    depth = r - dist;
  }

  // Clear the surface with padding so the next frame doesn't re-stick.
  p.x += nx * (depth + 4);
  p.y += ny * (depth + 4);

  // Strip inward speed, then kick hard outward — strength tracks gravity.
  const vn = p.vx * nx + p.vy * ny;
  if (vn < 0) {
    p.vx -= vn * nx;
    p.vy -= vn * ny;
  }
  const kick = gravity * 0.5625 * (0.95 + Math.random() * 0.35);
  p.vx += kick * nx;
  p.vy += kick * ny;

  // Scatter sideways so they don't stack on the same bounce line.
  const tx = -ny;
  const ty = nx;
  const scatter = (Math.random() * 2 - 1) * kick * 0.45;
  p.vx += scatter * tx;
  p.vy += scatter * ty;
}

function pointerOverButton(state: SimState, pad = 0): boolean {
  const b = state.button;
  if (!b) return false;
  return (
    state.mouseX >= b.left - pad &&
    state.mouseX <= b.right + pad &&
    state.mouseY >= b.top - pad &&
    state.mouseY <= b.bottom + pad
  );
}

function updateParticles(state: SimState, dt: number): void {
  const { gravity, particleCount } = state.settings;
  // Light drag so bounce arcs keep sideways speed instead of stalling into a vertical drop.
  const damp = Math.exp(-1.0 * dt);

  // Don't spawn on the CTA — birth inside the hitbox fires an instant kick (often downward).
  if (state.hasMouse && !pointerOverButton(state, 56)) {
    state.spawnAcc += particleCount * dt;
    while (state.spawnAcc >= 1) {
      state.particles.push(spawnParticle(state));
      state.spawnAcc -= 1;
    }
  }

  const next: Particle[] = [];
  const margin = 80;
  const button = state.button;
  for (const p of state.particles) {
    p.vx *= damp;
    p.vy *= damp;
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.spin * dt;
    p.life += dt;
    if (button) collideParticleWithButton(p, button, gravity);
    if (
      p.y < state.height + margin &&
      p.x > -margin &&
      p.x < state.width + margin &&
      p.life < 8
    ) {
      next.push(p);
    }
  }
  state.particles = next;
}

const pathCache = new Map<GalleryShape, Path2D>();

function shapePath(shape: GalleryShape): Path2D {
  let path = pathCache.get(shape);
  if (!path) {
    path = new Path2D(GALLERY_SHAPE_PATHS[shape]);
    pathCache.set(shape, path);
  }
  return path;
}

/** Seconds for a newly spawned shape to grow from 0 → full size. */
const SPAWN_SCALE_DURATION = 0.5;

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

function drawParticles(ctx: CanvasRenderingContext2D, state: SimState): void {
  ctx.clearRect(0, 0, state.width, state.height);
  const half = GALLERY_SHAPE_VIEWBOX / 2;
  for (const p of state.particles) {
    const birth = easeOutCubic(Math.min(1, p.life / SPAWN_SCALE_DURATION));
    const scale = (p.size / GALLERY_SHAPE_VIEWBOX) * birth;
    if (scale <= 0) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.scale(scale, scale);
    ctx.translate(-half, -half);
    ctx.fillStyle = p.color;
    ctx.fill(shapePath(p.shape), "evenodd");
    ctx.restore();
  }
}

function formatValue(key: keyof EmitterSettings, value: number): string {
  switch (key) {
    case "particleCount":
      return `${Math.round(value)}/s`;
    case "particleSize":
      return `${Math.round(value)}px`;
    case "randomness":
    case "rotationRandomness":
      return value.toFixed(2);
    case "rotationSpeed":
    case "headlineSize":
    case "buttonSize":
      return value.toFixed(1);
    case "headlineLineHeight":
      return value.toFixed(2);
    case "headlineButtonGap":
      return `${Math.round(value)}px`;
    case "gravity":
      return `${Math.round(value)}`;
    case "blastRadius":
      return `${Math.round(value)}`;
  }
}

const SLIDERS: {
  key: keyof EmitterSettings;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "particleCount", label: "Particle count", min: 1, max: 120, step: 1 },
  { key: "particleSize", label: "Particle size", min: 8, max: 150, step: 1 },
  { key: "randomness", label: "Particle randomness", min: 0, max: 1, step: 0.01 },
  { key: "rotationSpeed", label: "Rotation speed", min: 0, max: 4, step: 0.1 },
  {
    key: "rotationRandomness",
    label: "Rotation randomness",
    min: 0,
    max: 1,
    step: 0.01,
  },
  { key: "gravity", label: "Gravity", min: 200, max: 4000, step: 50 },
  { key: "blastRadius", label: "Initial blast", min: 40, max: 1200, step: 10 },
  { key: "headlineSize", label: "Font size", min: 0.25, max: 4, step: 0.05 },
  {
    key: "headlineLineHeight",
    label: "Line height",
    min: 0.7,
    max: 1.4,
    step: 0.05,
  },
  {
    key: "headlineButtonGap",
    label: "Button distance",
    min: 0,
    max: 120,
    step: 1,
  },
  { key: "buttonSize", label: "Button size", min: 0.25, max: 4, step: 0.05 },
];

export function NotFoundPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctaRef = useRef<HTMLAnchorElement>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy settings");
  const [headlineMessage, setHeadlineMessage] = useState(
    "Oops, this page doesn't even exist",
  );
  const [buttonLabel, setButtonLabel] = useState("Go to Mozayk");
  const [settings, setSettings] = useState<EmitterSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "d" && event.key !== "D") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setDevOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state: SimState = {
      particles: [],
      mouseX: window.innerWidth / 2,
      mouseY: window.innerHeight / 2,
      hasMouse: false,
      spawnAcc: 0,
      width: 0,
      height: 0,
      dpr: 1,
      settings: settingsRef.current,
      button: null,
    };

    const syncButtonBounds = () => {
      const cta = ctaRef.current;
      if (!cta) {
        state.button = null;
        return;
      }
      const rect = cta.getBoundingClientRect();
      state.button = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    };

    const resize = () => {
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.width = window.innerWidth;
      state.height = window.innerHeight;
      canvas.width = Math.floor(state.width * state.dpr);
      canvas.height = Math.floor(state.height * state.dpr);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      syncButtonBounds();
    };

    const onPointerMove = (event: PointerEvent) => {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
      state.hasMouse = true;
    };

    const onPointerLeave = () => {
      state.hasMouse = false;
    };

    state.hasMouse = true;
    for (let i = 0; i < 12; i++) state.particles.push(spawnParticle(state));

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);
    document.documentElement.addEventListener("mouseleave", onPointerLeave);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      state.settings = settingsRef.current;
      syncButtonBounds();
      updateParticles(state, dt);
      drawParticles(ctx, state);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.documentElement.removeEventListener("mouseleave", onPointerLeave);
    };
  }, []);

  return (
    <div
      className="not-found"
      style={
        {
          "--nf-button-scale": String(settings.buttonSize),
          "--nf-headline-scale": String(settings.headlineSize),
          "--nf-headline-lh": String(settings.headlineLineHeight),
          "--nf-headline-button-gap": String(settings.headlineButtonGap),
        } as CSSProperties
      }
    >
      <div className="not-found__blend">
        <canvas
          ref={canvasRef}
          className="not-found__canvas"
          aria-hidden="true"
        />
        <div className="not-found__center">
          <div className="not-found__copy">
            <h1 className="not-found__title">{headlineMessage}</h1>
            <a
              ref={ctaRef}
              className="not-found__cta"
              href={import.meta.env.BASE_URL}
            >
              {buttonLabel}
            </a>
          </div>
        </div>
      </div>

      {devOpen ? (
        <aside className="not-found__dev" aria-label="Emitter dev menu">
          <p className="not-found__dev-title">Emitter</p>
          <div className="not-found__dev-row">
            <label htmlFor="nf-headline-message">Message</label>
            <input
              id="nf-headline-message"
              className="not-found__dev-text"
              type="text"
              value={headlineMessage}
              onChange={(event) => setHeadlineMessage(event.target.value)}
            />
          </div>
          <div className="not-found__dev-row">
            <label htmlFor="nf-button-label">Button label</label>
            <input
              id="nf-button-label"
              className="not-found__dev-text"
              type="text"
              value={buttonLabel}
              onChange={(event) => setButtonLabel(event.target.value)}
            />
          </div>
          {SLIDERS.map(({ key, label, min, max, step }) => (
            <div className="not-found__dev-row" key={key}>
              <label htmlFor={`nf-${key}`}>{label}</label>
              <span className="not-found__dev-value">
                {formatValue(key, settings[key])}
              </span>
              <input
                id={`nf-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={settings[key]}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSettings((prev) => ({ ...prev, [key]: value }));
                }}
              />
            </div>
          ))}
          <button
            type="button"
            className="not-found__dev-copy"
            onClick={() => {
              const escape = (value: string) =>
                value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              const lines = Object.entries(settings).map(([key, value]) => {
                const num =
                  typeof value === "number" && !Number.isInteger(value)
                    ? Number(value.toFixed(4))
                    : value;
                return `  ${key}: ${num},`;
              });
              const text = `headlineMessage: "${escape(headlineMessage)}",\nbuttonLabel: "${escape(buttonLabel)}",\n{\n${lines.join("\n")}\n}`;
              void navigator.clipboard.writeText(text).then(
                () => setCopyLabel("Copied"),
                () => setCopyLabel("Copy failed"),
              );
              window.setTimeout(() => setCopyLabel("Copy settings"), 1200);
            }}
          >
            {copyLabel}
          </button>
        </aside>
      ) : null}
    </div>
  );
}
