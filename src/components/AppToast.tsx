import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

const HOLD_MS = 2_200;
/** Match `.app-toast` slide duration. */
const SLIDE_MS = 450;
const STAGE_INSET = 24;

type AppToastProps = {
  message: string;
  onDone: () => void;
};

type Anchor = {
  top: number;
  left: number;
  width: number;
};

function readAnchor(): Anchor | null {
  const stage = document.querySelector(".canvas-stage");
  if (!(stage instanceof HTMLElement)) return null;
  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: rect.top + STAGE_INSET,
    left: rect.left,
    width: rect.width,
  };
}

export function AppToast({ message, onDone }: AppToastProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [travel, setTravel] = useState(0);
  const badgeRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef(0);
  const clearTimerRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    const update = () => setAnchor(readAnchor());
    update();
    const stage = document.querySelector(".canvas-stage");
    const observer =
      stage instanceof HTMLElement ? new ResizeObserver(update) : null;
    if (stage instanceof HTMLElement) observer?.observe(stage);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [message]);

  useLayoutEffect(() => {
    if (!anchor || !badgeRef.current) return;
    setTravel(STAGE_INSET + badgeRef.current.offsetHeight);
  }, [message, anchor]);

  const ready = anchor != null && travel > 0;

  useLayoutEffect(() => {
    if (!ready) return;

    window.clearTimeout(hideTimerRef.current);
    window.clearTimeout(clearTimerRef.current);
    setOpen(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setOpen(true);
        hideTimerRef.current = window.setTimeout(() => {
          setOpen(false);
          clearTimerRef.current = window.setTimeout(() => {
            onDoneRef.current();
          }, SLIDE_MS);
        }, HOLD_MS);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(clearTimerRef.current);
    };
  }, [message, ready]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(clearTimerRef.current);
    };
  }, []);

  if (!anchor) return null;

  return createPortal(
    <div
      className={`app-toast${open ? " is-visible" : ""}`}
      style={
        {
          left: anchor.left,
          width: anchor.width,
          "--app-toast-top": `${anchor.top}px`,
          "--app-toast-travel": travel > 0 ? `${travel}px` : "80px",
        } as CSSProperties
      }
    >
      <div ref={badgeRef} className="app-toast__badge" role="status">
        {message}
      </div>
    </div>,
    document.body,
  );
}
