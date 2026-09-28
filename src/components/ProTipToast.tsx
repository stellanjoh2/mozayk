import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  getProTipsEnabled,
  getProTipsVoiceAssist,
  markProTipSeen,
  nextUnseenProTip,
  PRO_TIPS_ENABLED_EVENT,
  setProTipsEnabled,
  type ProTip,
} from "../ui/proTips";
import { playUiSoundOnNextGesture, stopVoiceSound } from "../ui/sounds";
import { TypewriterReveal } from "./TypewriterReveal";

const INITIAL_DELAY_MS = 5_000;
const HOLD_MS = 10_000;
const GAP_MS = 12_000;
const SLIDE_MS = 500;
const TEXT_FADE_MS = 280;
const STAGE_INSET = 16;
const STAGE_INSET_FULLSCREEN = 20;
const TIP_WIDTH = 384;

const TITLE = "Pro Tip";
const OPT_OUT = "I don’t want to see these :(";

type ProTipToastProps = {
  enabled?: boolean;
};

type TipAnchor = {
  top: number;
  left: number;
  width: number;
};

/** One typewriter activation. Remount via `key` for each run. */
type LineRun = {
  id: number;
  sound: boolean;
};

type Line = "title" | "body" | "optOut";

type Runs = Record<Line, LineRun | null>;

const EMPTY_RUNS: Runs = { title: null, body: null, optOut: null };

function readTipAnchor(): TipAnchor | null {
  const stage = document.querySelector(".canvas-stage");
  if (!(stage instanceof HTMLElement)) return null;
  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const fullscreen = stage.classList.contains("is-fullscreen");
  const inset = fullscreen ? STAGE_INSET_FULLSCREEN : STAGE_INSET;
  const viewportRight = document.documentElement.clientWidth;
  // Same content start as before; stretch the card flush to the browser edge.
  const left = rect.right - inset - TIP_WIDTH;
  const width = Math.max(TIP_WIDTH, viewportRight - left);
  if (width < 120) return null;
  return {
    top: rect.top + inset,
    left,
    width,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(id);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitTwoFrames(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        resolve();
      });
    });
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function ProTipToast({ enabled = true }: ProTipToastProps) {
  const [prefsOn, setPrefsOn] = useState(getProTipsEnabled);
  /** Bumps whenever tips prefs/catalog reset so the async loop restarts. */
  const [loopGen, setLoopGen] = useState(0);
  const [tip, setTip] = useState<ProTip | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [textFading, setTextFading] = useState(false);
  const [anchor, setAnchor] = useState<TipAnchor | null>(null);
  const [runs, setRuns] = useState<Runs>(EMPTY_RUNS);

  const runIdRef = useRef(0);
  const pendingRef = useRef<{ id: number; resolve: () => void } | null>(null);
  const finishLineRef = useRef<(runId: number | undefined) => void>(() => {});
  const loopAbortRef = useRef<AbortController | null>(null);
  const tipAbortRef = useRef<AbortController | null>(null);

  const active = enabled && prefsOn;

  useEffect(() => {
    const sync = () => {
      setPrefsOn(getProTipsEnabled());
      setLoopGen((n) => n + 1);
    };
    window.addEventListener(PRO_TIPS_ENABLED_EVENT, sync);
    return () => window.removeEventListener(PRO_TIPS_ENABLED_EVENT, sync);
  }, []);

  useLayoutEffect(() => {
    if (!tip) {
      setAnchor(null);
      return;
    }
    const update = () => setAnchor(readTipAnchor());
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
  }, [tip]);

  useEffect(() => {
    if (!active) {
      tipAbortRef.current?.abort();
      loopAbortRef.current?.abort();
      tipAbortRef.current = null;
      loopAbortRef.current = null;
      pendingRef.current = null;
      setTip(null);
      setCardOpen(false);
      setTextFading(false);
      setRuns(EMPTY_RUNS);
      return;
    }

    const loopAc = new AbortController();
    loopAbortRef.current = loopAc;
    const loopSignal = loopAc.signal;

    const resetRuns = () => {
      pendingRef.current = null;
      setRuns(EMPTY_RUNS);
    };

    const awaitLine = (line: Line, sound: boolean, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }

        const id = ++runIdRef.current;

        const onAbort = () => {
          if (pendingRef.current?.id === id) pendingRef.current = null;
          reject(new DOMException("aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });

        pendingRef.current = {
          id,
          resolve: () => {
            signal.removeEventListener("abort", onAbort);
            if (pendingRef.current?.id === id) pendingRef.current = null;
            resolve();
          },
        };

        setRuns((prev) => ({
          ...prev,
          [line]: { id, sound },
        }));
      });

    finishLineRef.current = (runId) => {
      const pending = pendingRef.current;
      if (runId == null || !pending || pending.id !== runId) return;
      pending.resolve();
    };

    const closeCard = async (signal: AbortSignal) => {
      setTextFading(true);
      try {
        await sleep(TEXT_FADE_MS, signal);
      } catch {
        /* ignore */
      }
      setCardOpen(false);
      try {
        await sleep(SLIDE_MS, signal);
      } catch {
        /* ignore */
      }
      resetRuns();
      setTextFading(false);
      setTip(null);
    };

    const runTip = async (current: ProTip) => {
      const tipAc = new AbortController();
      tipAbortRef.current = tipAc;

      const onLoopAbort = () => tipAc.abort();
      loopSignal.addEventListener("abort", onLoopAbort, { once: true });
      const signal = tipAc.signal;

      resetRuns();
      setTextFading(false);
      setTip(current);
      setCardOpen(false);
      let cancelVoice: (() => void) | undefined;
      let ownsVoice = false;

      try {
        await waitTwoFrames(signal);
        setCardOpen(true);
        // Voice assist and typewriter clicks are either/or.
        const voiceAssist = getProTipsVoiceAssist();
        if (voiceAssist && current.sound) {
          cancelVoice = playUiSoundOnNextGesture(current.sound, () => {
            ownsVoice = true;
          });
        }
        await sleep(SLIDE_MS, signal);

        const typeSound = !voiceAssist;
        await awaitLine("title", typeSound, signal);
        await awaitLine("body", typeSound, signal);
        await awaitLine("optOut", false, signal);

        await sleep(HOLD_MS, signal);

        await closeCard(signal);
        markProTipSeen(current.id);
      } catch (error) {
        if (!isAbort(error)) throw error;
        if (ownsVoice) stopVoiceSound();
        if (getProTipsEnabled() && !loopSignal.aborted) {
          await closeCard(loopSignal);
          markProTipSeen(current.id);
        } else {
          setCardOpen(false);
          setTextFading(false);
          resetRuns();
          setTip(null);
        }
      } finally {
        cancelVoice?.();
        loopSignal.removeEventListener("abort", onLoopAbort);
        if (tipAbortRef.current === tipAc) tipAbortRef.current = null;
      }
    };

    void (async () => {
      try {
        await sleep(INITIAL_DELAY_MS, loopSignal);
        while (!loopSignal.aborted && getProTipsEnabled()) {
          const next = nextUnseenProTip();
          if (!next) break;
          await runTip(next);
          if (loopSignal.aborted || !getProTipsEnabled()) break;
          await sleep(GAP_MS, loopSignal);
        }
      } catch (error) {
        if (!isAbort(error)) console.error(error);
      } finally {
        if (loopAbortRef.current === loopAc) loopAbortRef.current = null;
      }
    })();

    return () => {
      tipAbortRef.current?.abort();
      loopAc.abort();
      if (loopAbortRef.current === loopAc) loopAbortRef.current = null;
      pendingRef.current = null;
      finishLineRef.current = () => {};
    };
  }, [active, loopGen]);

  if (!tip || !anchor) return null;

  const titleRun = runs.title;
  const bodyRun = runs.body;
  const optOutRun = runs.optOut;

  return createPortal(
    <div
      className={`pro-tip${cardOpen ? " is-visible" : ""}`}
      role="status"
      style={
        {
          top: anchor.top,
          width: anchor.width,
          // Slide target for CSS `left` (transform would break frost).
          "--pro-tip-left": `${anchor.left}px`,
        } as CSSProperties
      }
      onClick={() => tipAbortRef.current?.abort()}
    >
      <div className={`pro-tip__copy${textFading ? " is-fading" : ""}`}>
        <TypewriterReveal
          key={titleRun ? `title-${titleRun.id}` : "title-idle"}
          as="span"
          className="pro-tip__title"
          text={TITLE}
          active={Boolean(titleRun)}
          hold
          caret={false}
          playTypeSound={Boolean(titleRun?.sound)}
          onComplete={() => finishLineRef.current(titleRun?.id)}
        />
        <TypewriterReveal
          key={bodyRun ? `body-${bodyRun.id}` : "body-idle"}
          as="span"
          className="pro-tip__body"
          text={tip.body}
          keys={tip.keys}
          active={Boolean(bodyRun)}
          hold
          caret={false}
          playTypeSound={Boolean(bodyRun?.sound)}
          onComplete={() => finishLineRef.current(bodyRun?.id)}
        />
        <button
          type="button"
          className="pro-tip__opt-out"
          onClick={(event) => {
            event.stopPropagation();
            setProTipsEnabled(false);
            tipAbortRef.current?.abort();
            loopAbortRef.current?.abort();
          }}
        >
          <TypewriterReveal
            key={optOutRun ? `opt-${optOutRun.id}` : "opt-idle"}
            as="span"
            text={OPT_OUT}
            active={Boolean(optOutRun)}
            hold
            caret={false}
            playTypeSound={false}
            onComplete={() => finishLineRef.current(optOutRun?.id)}
          />
        </button>
      </div>
    </div>,
    document.body,
  );
}
