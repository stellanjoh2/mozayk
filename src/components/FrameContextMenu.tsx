import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { playUiSound } from "../ui/sounds";

gsap.registerPlugin(useGSAP);

const MENU_GAP = 8;
/** Keep the panel to the right of the click, not under / left of the cursor. */
const MENU_RIGHT_OF_CURSOR = 16;

function uiZoom(): number {
  const n = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--ui-compact-zoom"),
  );
  return n > 0 ? n : 1;
}

type FrameContextMenuProps = {
  x: number;
  y: number;
  canPaste: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function FrameContextMenu({
  x,
  y,
  canPaste,
  canDuplicate,
  canDelete,
  onCopyStyle,
  onPasteStyle,
  onDuplicate,
  onDelete,
  onClose,
}: FrameContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closingRef = useRef(false);
  const closeMenuRef = useRef<(after?: () => void) => void>(() => {
    onCloseRef.current();
  });

  useGSAP(
    (_, contextSafe) => {
      const el = rootRef.current;
      if (!el) return;

      el.style.height = "auto";
      const visual = el.getBoundingClientRect();
      const width = visual.width;
      const visualHeight = visual.height;
      const height = el.offsetHeight;
      const zoom = uiZoom();

      let left = x + MENU_RIGHT_OF_CURSOR;
      const maxLeft = window.innerWidth - MENU_GAP - width;
      if (left > maxLeft) {
        // Stay on screen, but don't slide the whole menu to the left of the click.
        left = Math.max(x, maxLeft);
      }
      left = Math.max(MENU_GAP, Math.min(left, maxLeft));

      let bottom = window.innerHeight - y + 4;
      if (bottom + visualHeight > window.innerHeight - MENU_GAP) {
        bottom = Math.max(MENU_GAP, window.innerHeight - MENU_GAP - visualHeight);
      }
      // `zoom` scales used left/bottom, so write layout px that land on the cursor.
      el.style.left = `${Math.round(left / zoom)}px`;
      el.style.bottom = `${Math.round(bottom / zoom)}px`;

      el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({
        preventScroll: true,
      });

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      closeMenuRef.current = contextSafe((after?: () => void) => {
        if (closingRef.current) return;
        closingRef.current = true;
        const finish = () => {
          after?.();
          onCloseRef.current();
        };
        if (reduced) {
          finish();
          return;
        }
        const current = rootRef.current;
        if (!current) {
          finish();
          return;
        }
        gsap.to(current, {
          height: 0,
          duration: 0.18,
          ease: "power2.in",
          overwrite: true,
          onComplete: finish,
        });
      });

      if (reduced) return;

      gsap.set(el, { height: 0 });
      gsap.to(el, {
        height,
        duration: 0.22,
        ease: "power2.out",
        onComplete: () => {
          gsap.set(el, { height: "auto" });
        },
      });
    },
    { scope: rootRef },
  );

  useEffect(() => {
    const openedAt = performance.now();
    const requestClose = () => closeMenuRef.current();
    const onPointerDown = (event: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      requestClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      playUiSound("close");
      requestClose();
    };
    const onScroll = () => {
      // Right-clicking a frame selects it and may start a smooth scroll;
      // don't treat that as "click outside".
      if (performance.now() - openedAt < 400) return;
      requestClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", requestClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", requestClose);
    };
  }, []);

  const runThenClose = (action: () => void) => {
    closeMenuRef.current(action);
  };

  return createPortal(
    <div
      ref={rootRef}
      className="frame-context-menu"
      role="menu"
      aria-label="Frame actions"
      style={{
        left: (x + MENU_RIGHT_OF_CURSOR) / uiZoom(),
        bottom: (window.innerHeight - y + 4) / uiZoom(),
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        onClick={() => runThenClose(onCopyStyle)}
      >
        Copy Style
      </button>
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        disabled={!canPaste}
        onClick={() => runThenClose(onPasteStyle)}
      >
        Paste Style
      </button>
      <div className="frame-context-menu__rule" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        disabled={!canDuplicate}
        onClick={() => runThenClose(onDuplicate)}
      >
        Duplicate Frame
      </button>
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        disabled={!canDelete}
        onClick={() => runThenClose(onDelete)}
      >
        Delete Frame
      </button>
    </div>,
    document.body,
  );
}
