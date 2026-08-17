import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { playUiSound } from "../ui/sounds";

gsap.registerPlugin(useGSAP);

const MENU_GAP = 8;

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

  useGSAP(
    () => {
      const el = rootRef.current;
      if (!el) return;

      el.style.height = "auto";
      const width = el.offsetWidth;
      const height = el.offsetHeight;

      let left = x;
      if (left + width > window.innerWidth - MENU_GAP) {
        left = window.innerWidth - MENU_GAP - width;
      }
      left = Math.max(MENU_GAP, left);

      let bottom = window.innerHeight - y + 4;
      if (bottom + height > window.innerHeight - MENU_GAP) {
        bottom = Math.max(MENU_GAP, window.innerHeight - MENU_GAP - height);
      }
      el.style.left = `${Math.round(left)}px`;
      el.style.bottom = `${Math.round(bottom)}px`;

      el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({
        preventScroll: true,
      });

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

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
    const onPointerDown = (event: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (event.target instanceof Node && el.contains(event.target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      playUiSound("close");
      onCloseRef.current();
    };
    const onScroll = () => {
      // Right-clicking a frame selects it and may start a smooth scroll;
      // don't treat that as "click outside".
      if (performance.now() - openedAt < 400) return;
      onCloseRef.current();
    };
    const onResize = () => onCloseRef.current();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return createPortal(
    <div
      ref={rootRef}
      className="frame-context-menu"
      role="menu"
      aria-label="Frame actions"
      style={{ left: x, bottom: window.innerHeight - y + 4 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        onClick={onCopyStyle}
      >
        Copy Style
      </button>
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        disabled={!canPaste}
        onClick={onPasteStyle}
      >
        Paste Style
      </button>
      <div className="frame-context-menu__rule" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        disabled={!canDuplicate}
        onClick={onDuplicate}
      >
        Duplicate Frame
      </button>
      <button
        type="button"
        role="menuitem"
        className="frame-context-menu__item"
        disabled={!canDelete}
        onClick={onDelete}
      >
        Delete Frame
      </button>
    </div>,
    document.body,
  );
}
