import { useEffect, useRef } from "react";
import { MobileGateLogo } from "./MobileGateLogo";

/** Extra cover so subpixel / iOS chrome math can't leave a 1px mosaic seam. */
const VIEWPORT_OVERSCAN_PX = 2;

/** Pin the gate to the visible iOS/Android viewport (not the taller layout viewport). */
function syncVisualViewport(el: HTMLElement) {
  const pad = VIEWPORT_OVERSCAN_PX;
  const vv = window.visualViewport;
  if (!vv) {
    el.style.top = `-${pad}px`;
    el.style.left = `-${pad}px`;
    el.style.width = `calc(100% + ${pad * 2}px)`;
    el.style.height = `calc(100svh + ${pad * 2}px)`;
    return;
  }
  el.style.top = `${vv.offsetTop - pad}px`;
  el.style.left = `${vv.offsetLeft - pad}px`;
  el.style.width = `${vv.width + pad * 2}px`;
  el.style.height = `${vv.height + pad * 2}px`;
}

export function MobileGate({ onRandomizeAll }: { onRandomizeAll: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const sync = () => syncVisualViewport(root);
    sync();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    const blockScroll = (event: TouchEvent) => {
      event.preventDefault();
    };
    document.addEventListener("touchmove", blockScroll, { passive: false });

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("touchmove", blockScroll);
    };
  }, []);

  return (
    <div ref={rootRef} className="mobile-gate" role="status">
      <a
        className="mobile-gate__s"
        href="https://x.com/johstell"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Stellan Johansson on X"
      />
      <div className="mobile-gate__logo">
        <MobileGateLogo ariaLabel="Randomize all" onClick={onRandomizeAll} />
      </div>
      <div className="mobile-gate__copy">
        <p>Not intended for mobile screens, please go sit down at a real computer.</p>
        <p className="mobile-gate__copy-hey">Hey tap the logotype!</p>
      </div>
    </div>
  );
}
