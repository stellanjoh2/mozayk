import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  palettePresetsForCategory,
  type PaletteCategory,
  type PalettePreset,
} from "../presets/palettePresets";
import { playUiSound } from "../ui/sounds";
import { PaletteGallery } from "./PaletteGallery";

gsap.registerPlugin(useGSAP);

const PANEL_TRANSITION_MS = 450;
const PALETTE_TAB_STORAGE_KEY = "mosaik.paletteTab";

const PALETTE_TAB_ORDER: PaletteCategory[] = ["common", "retro", "feral"];

function tabLineOffset(tab: PaletteCategory): number {
  return PALETTE_TAB_ORDER.indexOf(tab) * 100;
}

function readLastPaletteTab(): PaletteCategory {
  try {
    const stored = localStorage.getItem(PALETTE_TAB_STORAGE_KEY);
    if (stored === "retro" || stored === "feral") return stored;
  } catch {
    /* ignore */
  }
  return "common";
}

function writeLastPaletteTab(tab: PaletteCategory): void {
  try {
    if (tab === "common") {
      localStorage.removeItem(PALETTE_TAB_STORAGE_KEY);
    } else {
      localStorage.setItem(PALETTE_TAB_STORAGE_KEY, tab);
    }
  } catch {
    /* ignore */
  }
}

type PalettePanelProps = {
  open: boolean;
  onClose: () => void;
  onApplyPreset: (preset: PalettePreset) => void;
  onAnimatingChange?: (animating: boolean) => void;
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z"
      />
    </svg>
  );
}

export function PalettePanel({
  open,
  onClose,
  onApplyPreset,
  onAnimatingChange,
}: PalettePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabLineRef = useRef<HTMLSpanElement>(null);
  const prevPaletteTabRef = useRef<PaletteCategory | null>(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [paletteTab, setPaletteTab] = useState<PaletteCategory>("common");

  const selectPaletteTab = (tab: PaletteCategory) => {
    if (tab === paletteTab) return;
    setPaletteTab(tab);
    writeLastPaletteTab(tab);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!open) return;
    const lastTab = readLastPaletteTab();
    setPaletteTab(lastTab);
    prevPaletteTabRef.current = null;
  }, [open]);

  useGSAP(
    () => {
      const line = tabLineRef.current;
      if (!line || !mounted) return;
      const target = tabLineOffset(paletteTab);
      const prev = prevPaletteTabRef.current;
      if (prev === null || prev === paletteTab) {
        gsap.set(line, { xPercent: target });
        prevPaletteTabRef.current = paletteTab;
        return;
      }
      prevPaletteTabRef.current = paletteTab;
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      gsap.to(line, {
        xPercent: target,
        duration: reduce ? 0 : 0.5,
        ease: "power4.inOut",
        overwrite: true,
      });
    },
    { scope: tabsRef, dependencies: [paletteTab, mounted] },
  );

  useEffect(() => {
    if (open) {
      onAnimatingChange?.(true);
      setMounted(true);
      return;
    }
    onAnimatingChange?.(true);
    setEntered(false);
    const fallback = window.setTimeout(
      () => onAnimatingChange?.(false),
      PANEL_TRANSITION_MS,
    );
    return () => window.clearTimeout(fallback);
  }, [open, onAnimatingChange]);

  useLayoutEffect(() => {
    if (!open || !mounted) return;
    setEntered(false);
    const panel = panelRef.current;
    if (panel) void panel.getBoundingClientRect();
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        playUiSound("close");
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, onClose]);

  useEffect(() => {
    if (!mounted || !entered) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".palette-panel")) return;
      event.preventDefault();
      event.stopPropagation();
      playUiSound("close");
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [mounted, entered, onClose]);

  if (!mounted) return null;

  const activePresets = palettePresetsForCategory(paletteTab);

  return (
    <aside
      ref={panelRef}
      className={["palette-panel", entered ? "is-open" : ""]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Colour themes"
      onPointerDown={(event) => event.stopPropagation()}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.propertyName !== "transform") return;
        onAnimatingChange?.(false);
        if (!open) setMounted(false);
      }}
    >
      <header className="palette-panel__head">
        <h2 className="palette-panel__title">Pick a Theme</h2>
        <button
          type="button"
          className="palette-panel__close"
          aria-label="Close"
          data-ui-sound="close"
          onClick={onClose}
        >
          <PlusIcon />
        </button>
      </header>

      <div
        ref={tabsRef}
        className="palette-panel__tabs"
        role="tablist"
        aria-label="Theme categories"
      >
        <button
          type="button"
          role="tab"
          aria-selected={paletteTab === "common"}
          className={
            paletteTab === "common"
              ? "palette-panel__tab is-active"
              : "palette-panel__tab"
          }
          onClick={() => selectPaletteTab("common")}
        >
          Common
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={paletteTab === "retro"}
          className={
            paletteTab === "retro"
              ? "palette-panel__tab is-active"
              : "palette-panel__tab"
          }
          onClick={() => selectPaletteTab("retro")}
        >
          Retro
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={paletteTab === "feral"}
          className={
            paletteTab === "feral"
              ? "palette-panel__tab is-active"
              : "palette-panel__tab"
          }
          onClick={() => selectPaletteTab("feral")}
        >
          Feral
        </button>
        <span ref={tabLineRef} className="palette-panel__tab-line" aria-hidden />
      </div>

      <div ref={scrollRef} className="palette-panel__scroll">
        <PaletteGallery
          layout="stack"
          presets={activePresets}
          onApplyPreset={onApplyPreset}
        />
      </div>
      <footer className="palette-panel__foot">
        <button
          type="button"
          className="panel-btn"
          data-ui-sound="close"
          onClick={onClose}
        >
          Close
        </button>
      </footer>
    </aside>
  );
}
