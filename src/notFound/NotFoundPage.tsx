import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BrandLogo } from "../components/BrandLogo";
import {
  GALLERY_SHAPE_PATHS,
  GALLERY_SHAPE_VIEWBOX,
  type GalleryShape,
} from "../shapes/galleryShapes";

/** Eight gallery shapes for the cursor emitter. */
const SHAPES = [
  "clover",
  "arrows",
  "spots",
  "arcs",
  "quads",
  "wedges",
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
  logoSize: number;
  headlineSize: number;
  headlineLineHeight: number;
  buttonSize: number;
  headlineButtonGap: number;
};

const DEFAULT_SETTINGS: EmitterSettings = {
  particleCount: 60,
  particleSize: 104,
  randomness: 0.89,
  rotationSpeed: 2.6,
  rotationRandomness: 0.87,
  gravity: 1800,
  blastRadius: 1070,
  logoSize: 460,
  headlineSize: 0.8,
  headlineLineHeight: 0.78,
  buttonSize: 0.5,
  headlineButtonGap: 92,
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
  // Higher randomness → spins can drop toward zero (slow) up to full speed.
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

function updateParticles(state: SimState, dt: number): void {
  const { gravity, particleCount } = state.settings;
  // Strong damping so the initial blast fades, then gravity owns the fall.
  const damp = Math.exp(-3.4 * dt);

  if (state.hasMouse) {
    state.spawnAcc += particleCount * dt;
    while (state.spawnAcc >= 1) {
      state.particles.push(spawnParticle(state));
      state.spawnAcc -= 1;
    }
  }

  const next: Particle[] = [];
  const margin = 80;
  for (const p of state.particles) {
    p.vx *= damp;
    p.vy *= damp;
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.spin * dt;
    p.life += dt;
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

function drawParticles(ctx: CanvasRenderingContext2D, state: SimState): void {
  ctx.clearRect(0, 0, state.width, state.height);
  const half = GALLERY_SHAPE_VIEWBOX / 2;
  for (const p of state.particles) {
    const scale = p.size / GALLERY_SHAPE_VIEWBOX;
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
    case "logoSize":
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
  { key: "particleSize", label: "Particle size", min: 8, max: 120, step: 1 },
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
  { key: "logoSize", label: "Logo size", min: 80, max: 900, step: 10 },
  { key: "headlineSize", label: "Headline size", min: 0.25, max: 2, step: 0.05 },
  {
    key: "headlineLineHeight",
    label: "Headline line height",
    min: 0.7,
    max: 1.4,
    step: 0.01,
  },
  { key: "buttonSize", label: "Button size", min: 0.25, max: 2, step: 0.05 },
  {
    key: "headlineButtonGap",
    label: "Headline → button gap",
    min: 0,
    max: 160,
    step: 1,
  },
];

export function NotFoundPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy settings");
  const [headlineMessage, setHeadlineMessage] = useState(
    "I'm sorry this page doesn't even exist",
  );
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
    };

    const onPointerMove = (event: PointerEvent) => {
      state.mouseX = event.clientX;
      state.mouseY = event.clientY;
      state.hasMouse = true;
    };

    const onPointerLeave = () => {
      state.hasMouse = false;
    };

    // Seed a few particles so the page isn't empty before first move.
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
          "--nf-headline-scale": String(settings.headlineSize),
          "--nf-headline-lh": String(settings.headlineLineHeight),
          "--nf-button-scale": String(settings.buttonSize),
          "--nf-headline-button-gap": String(settings.headlineButtonGap),
          "--nf-logo-size": String(settings.logoSize),
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
          <BrandLogo className="not-found__logo" />
          <h1 className="not-found__title">{headlineMessage}</h1>
          <a className="not-found__cta" href={import.meta.env.BASE_URL}>
            Go to Mozayk
          </a>
        </div>
      </div>

      {devOpen ? (
        <aside className="not-found__dev" aria-label="Emitter dev menu">
          <p className="not-found__dev-title">Emitter</p>
          <div className="not-found__dev-row">
            <label htmlFor="nf-headline-message">404 message</label>
            <input
              id="nf-headline-message"
              className="not-found__dev-text"
              type="text"
              value={headlineMessage}
              onChange={(event) => setHeadlineMessage(event.target.value)}
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
              const escaped = headlineMessage.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              const lines = Object.entries(settings).map(([key, value]) => {
                const num =
                  typeof value === "number" && !Number.isInteger(value)
                    ? Number(value.toFixed(4))
                    : value;
                return `  ${key}: ${num},`;
              });
              const text = `headlineMessage: "${escaped}",\n{\n${lines.join("\n")}\n}`;
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
