import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  hexToHsl,
  hexToHsv,
  hexToRgb,
  hslToHex,
  hsvToHex,
  isValidHex,
  normalizeHex,
  pushRecentColor,
  readRecentColors,
  rgbToHex,
  type ColorScale,
  type Hsv,
} from "../colorMath";

const PANEL_WIDTH = 296;

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

type ColorPickerProps = {
  value: string;
  anchorRef: RefObject<HTMLElement | null>;
  onChange: (hex: string) => void;
  onClose: () => void;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function placePanel(
  anchor: DOMRect,
  panelH: number,
): { left: number; top: number } {
  const gap = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.left - PANEL_WIDTH - gap;
  if (left < gap) left = Math.min(anchor.right + gap, vw - PANEL_WIDTH - gap);
  left = Math.max(gap, Math.min(left, vw - PANEL_WIDTH - gap));
  let top = anchor.top;
  if (top + panelH > vh - gap) top = Math.max(gap, vh - panelH - gap);
  top = Math.max(gap, top);
  return { left, top };
}

export function ColorPicker({
  value,
  anchorRef,
  onChange,
  onClose,
}: ColorPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normalizeHex(value)));
  const [scale, setScale] = useState<ColorScale>("hex");
  const [scaleOpen, setScaleOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(() => normalizeHex(value));
  const [rgbDraft, setRgbDraft] = useState(() => hexToRgb(normalizeHex(value)));
  const [hslDraft, setHslDraft] = useState(() => hexToHsl(normalizeHex(value)));
  const [recents] = useState<string[]>(() => readRecentColors());
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragModeRef = useRef<"sv" | "hue" | null>(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const closePicker = (commitRecent: boolean) => {
    if (commitRecent) {
      pushRecentColor(
        hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v),
      );
    }
    onCloseRef.current();
  };

  const applyHsv = (next: Hsv, emit = true) => {
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    setHexDraft(hex);
    setRgbDraft(hexToRgb(hex));
    setHslDraft(hexToHsl(hex));
    if (emit) onChangeRef.current(hex);
  };

  const applyHsvRef = useRef(applyHsv);
  applyHsvRef.current = applyHsv;

  const sampleFromPointer = (
    mode: "sv" | "hue",
    clientX: number,
    clientY: number,
  ) => {
    const el = mode === "sv" ? svRef.current : hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (mode === "hue") {
      const x = clamp01((clientX - rect.left) / Math.max(1, rect.width));
      applyHsvRef.current({ ...hsvRef.current, h: x * 360 });
      return;
    }
    const x = clamp01((clientX - rect.left) / Math.max(1, rect.width));
    const y = clamp01((clientY - rect.top) / Math.max(1, rect.height));
    applyHsvRef.current({ ...hsvRef.current, s: x, v: 1 - y });
  };
  const sampleFromPointerRef = useRef(sampleFromPointer);
  sampleFromPointerRef.current = sampleFromPointer;

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const root = rootRef.current;
    if (!anchor || !root) return;
    const place = () => {
      const h = root.getBoundingClientRect().height || 360;
      setPos(placePanel(anchor.getBoundingClientRect(), h));
    };
    place();
    const onScrollOrResize = () => place();
    window.addEventListener("resize", onScrollOrResize);
    // Sidebar + nested scrollers
    let node: HTMLElement | null = anchor;
    const scrollers: EventTarget[] = [window];
    while (node) {
      const style = getComputedStyle(node);
      if (
        /(auto|scroll|overlay)/.test(style.overflowY) ||
        /(auto|scroll|overlay)/.test(style.overflowX)
      ) {
        scrollers.push(node);
      }
      node = node.parentElement;
    }
    for (const t of scrollers) {
      t.addEventListener("scroll", onScrollOrResize, { passive: true });
    }
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      for (const t of scrollers) {
        t.removeEventListener("scroll", onScrollOrResize);
      }
    };
  }, [anchorRef]);

  useEffect(() => {
    const dismiss = (commitRecent: boolean) => {
      if (commitRecent) {
        pushRecentColor(
          hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v),
        );
      }
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss(true);
      }
    };
    const onDocPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      const anchor = anchorRef.current;
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (root?.contains(t) || anchor?.contains(t)) return;
      dismiss(true);
    };
    const bindId = requestAnimationFrame(() => {
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("pointerdown", onDocPointerDown, true);
    });
    return () => {
      cancelAnimationFrame(bindId);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const mode = dragModeRef.current;
      if (!mode) return;
      e.preventDefault();
      sampleFromPointerRef.current(mode, e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragModeRef.current) return;
      for (const el of [svRef.current, hueRef.current]) {
        if (el?.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      }
      dragModeRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragModeRef.current = "sv";
    sampleFromPointer("sv", e.clientX, e.clientY);
  };

  const onHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragModeRef.current = "hue";
    sampleFromPointer("hue", e.clientX, e.clientY);
  };

  const hueCss = hsvToHex(hsv.h, 1, 1);
  const eyeDropperSupported =
    typeof window !== "undefined" && "EyeDropper" in window;

  const runEyeDropper = async () => {
    const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor })
      .EyeDropper;
    if (!Ctor) return;
    try {
      const result = await new Ctor().open();
      applyHsv(hexToHsv(normalizeHex(result.sRGBHex)));
    } catch {
      /* user cancelled */
    }
  };

  const panel = (
    <div
      ref={rootRef}
      className="rfrct-color-picker"
      role="dialog"
      aria-label="Choose color"
      data-color-scale={scale}
      style={
        pos
          ? { left: pos.left, top: pos.top, visibility: "visible" }
          : { visibility: "hidden", left: 0, top: 0 }
      }
    >
      <div className="rfrct-color-picker__head">
        <h2 className="rfrct-color-picker__title">Select color</h2>
        <button
          type="button"
          className="rfrct-color-picker__close"
          aria-label="Close color picker"
          onClick={() => closePicker(true)}
        />
      </div>

      <div
        ref={svRef}
        className="rfrct-color-picker__sv"
        style={{
          background: `
            linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, ${hueCss})
          `,
        }}
        tabIndex={0}
        role="slider"
        aria-label="Saturation and brightness"
        onPointerDown={onSvPointerDown}
      >
        <div
          className="rfrct-color-picker__sv-thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div className="rfrct-color-picker__body">
        <div
          ref={hueRef}
          className="rfrct-color-picker__hue"
          style={{ ["--hue-ratio" as string]: hsv.h / 360 }}
          tabIndex={0}
          role="slider"
          aria-label="Hue"
          onPointerDown={onHuePointerDown}
        >
          <div className="rfrct-color-picker__hue-track" />
          <div className="rfrct-color-picker__hue-thumb" />
        </div>

        <div className="rfrct-color-picker__inputs">
          <button
            type="button"
            className="rfrct-color-picker__eyedropper"
            aria-label="Pick color from screen"
            disabled={!eyeDropperSupported}
            title={
              eyeDropperSupported
                ? "Pick color from screen"
                : "Eyedropper not supported in this browser"
            }
            onClick={() => void runEyeDropper()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M20.71 5.63l-2.34-2.34a1 1 0 0 0-1.41 0l-3.12 3.12-1.23-1.21-1.42 1.42 1.23 1.22-7.86 7.86c-.28.28-.44.67-.44 1.07V19h2.24c.4 0 .79-.16 1.07-.44l7.86-7.86 1.22 1.23 1.42-1.42-1.22-1.22 3.12-3.12a1 1 0 0 0 0-1.42zM6.41 18H5v-1.41l7.07-7.07 1.41 1.41L6.41 18z"
              />
            </svg>
          </button>

          <div className="rfrct-color-picker__fields-wrap">
            {scale === "hex" && (
              <div className="rfrct-color-picker__fields rfrct-color-picker__fields--hex">
                <input
                  ref={hexInputRef}
                  type="text"
                  className="rfrct-color-picker__hex"
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Hex color"
                  value={hexDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setHexDraft(raw);
                    if (isValidHex(raw)) applyHsv(hexToHsv(raw));
                  }}
                  onBlur={() => {
                    const hex = normalizeHex(hexDraft, hsvToHex(hsv.h, hsv.s, hsv.v));
                    applyHsv(hexToHsv(hex));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const hex = normalizeHex(
                        hexDraft,
                        hsvToHex(hsv.h, hsv.s, hsv.v),
                      );
                      applyHsv(hexToHsv(hex));
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </div>
            )}
            {scale === "rgb" && (
              <div className="rfrct-color-picker__fields rfrct-color-picker__fields--rgb">
                {(["r", "g", "b"] as const).map((ch) => (
                  <input
                    key={ch}
                    type="text"
                    className="rfrct-color-picker__channel"
                    inputMode="numeric"
                    aria-label={ch === "r" ? "Red" : ch === "g" ? "Green" : "Blue"}
                    value={Math.round(rgbDraft[ch])}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      const next = {
                        ...rgbDraft,
                        [ch]: Math.min(255, Math.max(0, n)),
                      };
                      setRgbDraft(next);
                      applyHsv(hexToHsv(rgbToHex(next.r, next.g, next.b)));
                    }}
                  />
                ))}
              </div>
            )}
            {scale === "hsl" && (
              <div className="rfrct-color-picker__fields rfrct-color-picker__fields--hsl">
                {(
                  [
                    ["h", "Hue", 360],
                    ["s", "Saturation", 100],
                    ["l", "Lightness", 100],
                  ] as const
                ).map(([ch, label, max]) => (
                  <input
                    key={ch}
                    type="text"
                    className="rfrct-color-picker__channel"
                    inputMode="numeric"
                    aria-label={label}
                    value={Math.round(hslDraft[ch])}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      const next = {
                        ...hslDraft,
                        [ch]: Math.min(max, Math.max(0, n)),
                      };
                      setHslDraft(next);
                      applyHsv(hexToHsv(hslToHex(next.h, next.s, next.l)));
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            className={`rfrct-color-picker__scale-combo${scaleOpen ? " is-open" : ""}`}
          >
            <button
              type="button"
              className="rfrct-color-picker__scale-trigger"
              aria-haspopup="listbox"
              aria-expanded={scaleOpen}
              aria-label="Color format"
              onClick={(e) => {
                e.stopPropagation();
                setScaleOpen((o) => !o);
              }}
            >
              {scale.toUpperCase()}
            </button>
            {scaleOpen ? (
              <ul className="rfrct-color-picker__scale-list" role="listbox">
                {(["hex", "rgb", "hsl"] as const).map((opt) => (
                  <li key={opt} role="option" aria-selected={scale === opt}>
                    <button
                      type="button"
                      className={`rfrct-color-picker__scale-option${
                        scale === opt ? " is-selected" : ""
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setScale(opt);
                        setScaleOpen(false);
                      }}
                    >
                      {opt.toUpperCase()}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        {recents.length > 0 ? (
          <div className="rfrct-color-picker__recent">
            <div className="rfrct-color-picker__recent-rule" aria-hidden="true" />
            <div
              className="rfrct-color-picker__recent-swatches"
              role="list"
              aria-label="Recently used colors"
            >
              {recents.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="listitem"
                  className="rfrct-color-picker__recent-swatch"
                  style={{ background: c }}
                  aria-label={`Use ${c}`}
                  onClick={() => applyHsv(hexToHsv(c))}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
