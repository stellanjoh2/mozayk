import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  ACTION_NOTICE_DISMISS_EVENT,
  ACTION_NOTICE_EVENT,
  type ActionNotice as ActionNoticeData,
} from "../ui/actionNotices";
import { getProTipsVoiceAssist } from "../ui/proTips";
import { playUiSoundOnNextGesture, stopVoiceSound } from "../ui/sounds";

const HOLD_MS = 9_000;
/** Match `.action-notice` slide duration. */
const SLIDE_MS = 450;
/** Same canvas inset as the pro-tip notification. */
const STAGE_INSET = 16;

type ActionNoticeProps = {
  enabled?: boolean;
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

export function ActionNotice({ enabled = true }: ActionNoticeProps) {
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  /** Travel so the badge starts fully above the canvas. */
  const [travel, setTravel] = useState(0);
  const badgeRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef(0);
  const clearTimerRef = useRef(0);
  const generationRef = useRef(0);
  const cancelVoiceRef = useRef<(() => void) | null>(null);
  const ownsVoiceRef = useRef(false);

  const clearVoiceGesture = () => {
    cancelVoiceRef.current?.();
    cancelVoiceRef.current = null;
  };

  const stopNoticeVoice = () => {
    clearVoiceGesture();
    if (ownsVoiceRef.current) {
      ownsVoiceRef.current = false;
      stopVoiceSound();
    }
  };

  useLayoutEffect(() => {
    if (!notice) {
      setAnchor(null);
      setTravel(0);
      return;
    }
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
  }, [notice]);

  useLayoutEffect(() => {
    if (!notice || !anchor || !badgeRef.current) return;
    setTravel(STAGE_INSET + badgeRef.current.offsetHeight);
  }, [notice, anchor]);

  const ready = anchor != null && travel > 0;

  useLayoutEffect(() => {
    if (!enabled || !notice || !ready) return;

    const gen = generationRef.current;
    setOpen(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (generationRef.current !== gen) return;
        setOpen(true);
        if (getProTipsVoiceAssist() && notice.sound) {
          clearVoiceGesture();
          ownsVoiceRef.current = false;
          cancelVoiceRef.current = playUiSoundOnNextGesture(notice.sound, () => {
            ownsVoiceRef.current = true;
          });
        }
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
          if (generationRef.current !== gen) return;
          setOpen(false);
          clearVoiceGesture();
          window.clearTimeout(clearTimerRef.current);
          clearTimerRef.current = window.setTimeout(() => {
            if (generationRef.current !== gen) return;
            setNotice(null);
          }, SLIDE_MS);
        }, HOLD_MS);
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [enabled, notice, ready]);

  const dismissNow = () => {
    generationRef.current += 1;
    window.clearTimeout(hideTimerRef.current);
    window.clearTimeout(clearTimerRef.current);
    stopNoticeVoice();
    setOpen(false);
    clearTimerRef.current = window.setTimeout(() => setNotice(null), SLIDE_MS);
  };

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(clearTimerRef.current);
      stopNoticeVoice();
      setOpen(false);
      setNotice(null);
      return;
    }

    const onNotice = (event: Event) => {
      const detail = (event as CustomEvent<ActionNoticeData>).detail;
      if (!detail?.id || !detail.body) return;
      generationRef.current += 1;
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(clearTimerRef.current);
      clearVoiceGesture();
      setOpen(false);
      setTravel(0);
      setNotice(detail);
    };

    const onDismiss = () => dismissNow();

    window.addEventListener(ACTION_NOTICE_EVENT, onNotice);
    window.addEventListener(ACTION_NOTICE_DISMISS_EVENT, onDismiss);
    return () => {
      window.removeEventListener(ACTION_NOTICE_EVENT, onNotice);
      window.removeEventListener(ACTION_NOTICE_DISMISS_EVENT, onDismiss);
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(clearTimerRef.current);
      stopNoticeVoice();
    };
  }, [enabled]);

  if (!notice || !anchor) return null;

  return createPortal(
    <div
      className={`action-notice${open ? " is-visible" : ""}`}
      style={
        {
          left: anchor.left,
          width: anchor.width,
          "--action-notice-top": `${anchor.top}px`,
          "--action-notice-travel": travel > 0 ? `${travel}px` : "200px",
        } as CSSProperties
      }
    >
      <div
        ref={badgeRef}
        className="action-notice__badge"
        role="status"
        onClick={dismissNow}
      >
        <span className="action-notice__title">HINT</span>
        <span className="action-notice__body">{notice.body}</span>
      </div>
    </div>,
    document.body,
  );
}
