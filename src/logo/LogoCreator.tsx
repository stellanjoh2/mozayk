import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import logoSvg from "../assets/mozayk_logo.svg?raw";
import { generateRandomPalette } from "../layout/generateLayout";
import { downloadBlob } from "../export/downloadBlob";
import { exportLogoMov } from "./exportLogoMov";
import {
  LOGO_HEIGHT,
  LOGO_WHITE,
  LOGO_WIDTH,
  LOOP_POOL_MAX,
  PIECE_SELECTOR,
  PNG_SCALE,
  SPEED_KEYS,
  SPEED_LABELS,
  SPEEDS,
  logoPieces,
  resolveLogoSvg,
  setPieceVisible,
  type Speed,
} from "./logoReveal";
import { paintLogoWithBrandTokens } from "./paintLogo";
import "./LogoCreator.css";

/** Must match --brand-blue / --brand-purple / --brand-orange in App.css */
const ORIGINAL_CHROMATIC = ["#2e1ebc", "#cf41f2", "#ff5300"] as const;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("PNG export failed"));
    img.src = url;
  });
}

export function LogoCreator() {
  const markRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const loopTimerRef = useRef<number | null>(null);
  const revealGenRef = useRef(0);
  const loopRef = useRef(false);
  const loopPoolRef = useRef<string[]>([]);
  const loopPoolIndexRef = useRef(0);
  const speedRef = useRef<Speed>("fast");
  const [markup, setMarkup] = useState(() => paintLogoWithBrandTokens(logoSvg));
  const [colors, setColors] = useState<string[]>(() => [...ORIGINAL_CHROMATIC]);
  const [speed, setSpeed] = useState<Speed>("fast");
  const [looping, setLooping] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playTick, setPlayTick] = useState(0);
  const [openMenu, setOpenMenu] = useState<null | "speed" | "export">(null);
  const [exporting, setExporting] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(false);
  speedRef.current = speed;
  playingRef.current = playing;

  const markStyle = useMemo(
    () =>
      ({
        "--logo-fill-1": colors[0],
        "--logo-fill-2": colors[1],
        "--logo-fill-3": colors[2],
        "--logo-fill-4": LOGO_WHITE,
      }) as CSSProperties,
    [colors],
  );

  const clearRevealTimers = () => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  };

  const clearLoopTimer = () => {
    if (loopTimerRef.current == null) return;
    window.clearTimeout(loopTimerRef.current);
    loopTimerRef.current = null;
  };

  const showAllPieces = () => {
    const svg = markRef.current?.querySelector("svg");
    if (!svg) return;
    for (const el of svg.querySelectorAll(PIECE_SELECTOR)) {
      setPieceVisible(el as SVGElement, true);
    }
  };

  const playReveal = () => {
    setPlaying(true);
    setPlayTick((tick) => tick + 1);
  };

  const stopPlayback = () => {
    loopRef.current = false;
    setLooping(false);
    loopPoolRef.current = [];
    loopPoolIndexRef.current = 0;
    revealGenRef.current += 1;
    clearRevealTimers();
    clearLoopTimer();
    setPlaying(false);
    showAllPieces();
  };

  const randomizeLayout = () => {
    if (playingRef.current || loopRef.current) stopPlayback();
    setMarkup(paintLogoWithBrandTokens(logoSvg));
  };
  const randomizeColours = () => {
    if (playingRef.current || loopRef.current) stopPlayback();
    setColors(generateRandomPalette(3));
  };
  const restoreColours = () => {
    if (playingRef.current || loopRef.current) stopPlayback();
    setColors([...ORIGINAL_CHROMATIC]);
  };

  const togglePlay = () => {
    if (playingRef.current || loopRef.current) {
      stopPlayback();
      return;
    }
    playReveal();
  };

  const nextLoopLayout = (): string => {
    const pool = loopPoolRef.current;
    if (pool.length < LOOP_POOL_MAX) {
      const generated = paintLogoWithBrandTokens(logoSvg);
      pool.push(generated);
      loopPoolIndexRef.current = pool.length - 1;
      return generated;
    }
    loopPoolIndexRef.current = (loopPoolIndexRef.current + 1) % pool.length;
    return pool[loopPoolIndexRef.current]!;
  };

  const toggleLoop = () => {
    if (loopRef.current) {
      stopPlayback();
      return;
    }
    loopRef.current = true;
    setLooping(true);
    loopPoolRef.current = [];
    loopPoolIndexRef.current = 0;
    setMarkup(nextLoopLayout());
  };

  useLayoutEffect(() => {
    if (playTick === 0) return;
    const svg = markRef.current?.querySelector("svg");
    if (!svg) return;
    const gen = ++revealGenRef.current;
    clearRevealTimers();
    clearLoopTimer();
    const pieces = logoPieces(svg);
    if (pieces.length === 0) return;
    const phaseMs = SPEEDS[speedRef.current] * 1000;
    const looping = loopRef.current;
    const armed = (fn: () => void) => {
      if (gen !== revealGenRef.current) return;
      fn();
    };
    pieces.forEach(({ el, t }) => {
      const showAt = t * phaseMs;
      setPieceVisible(el, showAt <= 0);
      if (showAt > 0) {
        timersRef.current.push(
          window.setTimeout(() => armed(() => setPieceVisible(el, true)), showAt),
        );
      }
      if (looping) {
        timersRef.current.push(
          window.setTimeout(
            () => armed(() => setPieceVisible(el, false)),
            phaseMs + t * phaseMs,
          ),
        );
      }
    });
    if (looping) {
      loopTimerRef.current = window.setTimeout(() => {
        armed(() => setMarkup(nextLoopLayout()));
      }, phaseMs * 2);
    } else {
      timersRef.current.push(
        window.setTimeout(() => armed(() => setPlaying(false)), phaseMs),
      );
    }
    return () => {
      revealGenRef.current += 1;
      clearRevealTimers();
      clearLoopTimer();
    };
  }, [playTick]);

  useLayoutEffect(() => {
    if (loopRef.current) {
      playReveal();
      return;
    }
    if (playTick > 0) {
      revealGenRef.current += 1;
      clearRevealTimers();
      clearLoopTimer();
      setPlaying(false);
    }
  }, [markup]);

  useEffect(
    () => () => {
      clearRevealTimers();
      clearLoopTimer();
    },
    [],
  );

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (speedMenuRef.current?.contains(target) || exportRef.current?.contains(target)) {
        return;
      }
      setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.code === "KeyQ") {
        event.preventDefault();
        randomizeLayout();
      } else if (event.code === "KeyW") {
        event.preventDefault();
        randomizeColours();
      } else if (event.code === "KeyE") {
        event.preventDefault();
        restoreColours();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const exportSvg = () => resolveLogoSvg(markup, colors);

  const onExportSvg = () => {
    setOpenMenu(null);
    const blob = new Blob([exportSvg()], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, "mozayk-logotype.svg");
  };

  const onExportPng = async () => {
    setOpenMenu(null);
    const width = Math.round(LOGO_WIDTH * PNG_SCALE);
    const height = Math.round(LOGO_HEIGHT * PNG_SCALE);
    const svg = exportSvg().replace(/<svg\b/, `<svg width="${width}" height="${height}"`);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const img = await loadImage(url);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("PNG export failed");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) throw new Error("PNG export failed");
      downloadBlob(blob, "mozayk-logotype.png");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const onExportMov = async (transparent = false) => {
    setOpenMenu(null);
    if (exporting) return;
    setExporting(true);
    try {
      await exportLogoMov(markup, colors, speedRef.current, { transparent });
    } catch (error) {
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="logo-creator">
      <div
        ref={markRef}
        className="logo-creator__mark"
        style={markStyle}
        role="img"
        aria-label="mozayk logotype"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      <nav className="logo-creator__dock" aria-label="Logotype tools">
        <div className="logo-creator__dock-group">
          <button type="button" aria-keyshortcuts="q" onClick={randomizeLayout}>
            Randomize Layout
          </button>
          <button type="button" aria-keyshortcuts="w" onClick={randomizeColours}>
            Randomize Colours
          </button>
          <button type="button" aria-keyshortcuts="e" onClick={restoreColours}>
            Restore
          </button>
        </div>
        <div className="logo-creator__dock-divider" aria-hidden="true" />
        <div className="logo-creator__dock-group">
          <button
            type="button"
            className={playing ? "is-on" : undefined}
            aria-pressed={playing}
            aria-keyshortcuts="Space"
            onClick={togglePlay}
          >
            {playing ? "Stop" : "Play"}
          </button>
          <button
            type="button"
            className={looping ? "is-on" : undefined}
            aria-pressed={looping}
            onClick={toggleLoop}
          >
            Loop
          </button>
          <div className="logo-creator__pop" ref={speedMenuRef}>
            <button
              type="button"
              className={openMenu === "speed" ? "is-on" : undefined}
              aria-expanded={openMenu === "speed"}
              aria-haspopup="menu"
              onClick={() => setOpenMenu((open) => (open === "speed" ? null : "speed"))}
            >
              Speed
            </button>
            {openMenu === "speed" ? (
              <div className="logo-creator__pop-menu" role="menu">
                {SPEED_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    className={speed === key ? "is-on" : undefined}
                    onClick={() => {
                      speedRef.current = key;
                      setSpeed(key);
                      setOpenMenu(null);
                      playReveal();
                    }}
                  >
                    {SPEED_LABELS[key]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="logo-creator__dock-divider" aria-hidden="true" />
        <div className="logo-creator__pop" ref={exportRef}>
          <button
            type="button"
            className={openMenu === "export" || exporting ? "is-on" : undefined}
            aria-expanded={openMenu === "export"}
            aria-haspopup="menu"
            disabled={exporting}
            onClick={() => setOpenMenu((open) => (open === "export" ? null : "export"))}
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
          {openMenu === "export" ? (
            <div className="logo-creator__pop-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void onExportPng()}>
                PNG
              </button>
              <button type="button" role="menuitem" onClick={onExportSvg}>
                SVG
              </button>
              <button type="button" role="menuitem" onClick={() => void onExportMov()}>
                MOV
              </button>
              <button type="button" role="menuitem" onClick={() => void onExportMov(true)}>
                MOV Transparent
              </button>
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
