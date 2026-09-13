import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import fourOhFourBaseSvg from "../assets/404_base.svg?raw";
import { paintLogoWithBrandTokens } from "../logo/paintLogo";
import {
  LOGO_WHITE,
  logoPieces,
  PIECE_SELECTOR,
  setPieceVisible,
  type Speed,
  SPEEDS,
} from "../logo/logoReveal";

/** Default logotype fills — blue / purple / orange / white. */
const LOGO_COLORS = ["#2e1ebc", "#cf41f2", "#ff5300", LOGO_WHITE] as const;

const LOOP_POOL_MAX = 20;
const DEFAULT_SPEED: Speed = "fast";

export function FourOhFourCreator({ className }: { className?: string }) {
  const markRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);
  const loopTimerRef = useRef<number | null>(null);
  const revealGenRef = useRef(0);
  const loopPoolRef = useRef<string[]>([]);
  const loopPoolIndexRef = useRef(0);
  const [markup, setMarkup] = useState(() => paintLogoWithBrandTokens(fourOhFourBaseSvg));
  const [colors] = useState<string[]>(() => [...LOGO_COLORS]);
  const [playTick, setPlayTick] = useState(0);

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

  const markHtml = useMemo(() => ({ __html: markup }), [markup]);

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

  const paintFourOhFour = () => paintLogoWithBrandTokens(fourOhFourBaseSvg);

  const nextLoopLayout = (): string => {
    const pool = loopPoolRef.current;
    if (pool.length < LOOP_POOL_MAX) {
      const generated = paintFourOhFour();
      pool.push(generated);
      loopPoolIndexRef.current = pool.length - 1;
      return generated;
    }
    loopPoolIndexRef.current = (loopPoolIndexRef.current + 1) % pool.length;
    return pool[loopPoolIndexRef.current]!;
  };

  const playReveal = () => {
    setPlayTick((tick) => tick + 1);
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
    const phaseMs = SPEEDS[DEFAULT_SPEED] * 1000;
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
      timersRef.current.push(
        window.setTimeout(
          () => armed(() => setPieceVisible(el, false)),
          phaseMs + t * phaseMs,
        ),
      );
    });

    loopTimerRef.current = window.setTimeout(() => {
      armed(() => setMarkup(nextLoopLayout()));
    }, phaseMs * 2);

    return () => {
      revealGenRef.current += 1;
      clearRevealTimers();
      clearLoopTimer();
    };
  }, [playTick]);

  useLayoutEffect(() => {
    playReveal();
  }, [markup]);

  useEffect(
    () => () => {
      clearRevealTimers();
      clearLoopTimer();
    },
    [],
  );

  useEffect(() => {
    // Start the continuous loop immediately
    playReveal();
  }, []);

  return (
    <div
      ref={markRef}
      className={className}
      style={markStyle}
      role="img"
      aria-label="404"
      dangerouslySetInnerHTML={markHtml}
    />
  );
}
