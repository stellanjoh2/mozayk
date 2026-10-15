import { useEffect, useRef } from "react";
import { MobileGateLogo } from "./MobileGateLogo";

/** Pin the gate to the visible iOS/Android viewport (not the taller layout viewport). */
function syncVisualViewport(el: HTMLElement) {
  const vv = window.visualViewport;
  if (!vv) {
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "100%";
    el.style.height = "100svh";
    return;
  }
  el.style.top = `${vv.offsetTop}px`;
  el.style.left = `${vv.offsetLeft}px`;
  el.style.width = `${vv.width}px`;
  el.style.height = `${vv.height}px`;
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
      <span className="mobile-gate__s" aria-hidden="true" />
      <div className="mobile-gate__logo">
        <MobileGateLogo ariaLabel="Randomize all" onClick={onRandomizeAll} />
      </div>
      <div className="mobile-gate__copy">
        <p>Not intended for mobile screens, please go sit down at a real computer.</p>
        <p>Hey tap the logotype!</p>
      </div>
    </div>
  );
}
