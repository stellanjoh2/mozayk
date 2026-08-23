import { useEffect, useMemo, useRef, useState } from "react";
import logoSvg from "../assets/mozayk_logo.svg?raw";
import { paintLogoWithBrandTokens } from "../logo/paintLogo";
import { playUiSound } from "../ui/sounds";

const HOVER_CYCLE_MS = 250;
const POOL_SIZE = 20;

function buildLogoPool(): string[] {
  return Array.from({ length: POOL_SIZE }, () => paintLogoWithBrandTokens(logoSvg));
}

export function BrandLogo({
  className,
  onClick,
  alwaysCycle = false,
  ariaLabel,
}: {
  className?: string;
  onClick?: () => void;
  alwaysCycle?: boolean;
  ariaLabel?: string;
}) {
  const pool = useMemo(buildLogoPool, []);
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);
  const alwaysCycleRef = useRef(alwaysCycle);
  alwaysCycleRef.current = alwaysCycle;

  const showNext = (silent = false) => {
    if (pool.length <= 1) return;
    setIndex((current) => {
      let next = Math.floor(Math.random() * pool.length);
      if (next === current) next = (next + 1) % pool.length;
      return next;
    });
    if (!silent) playUiSound("slider");
  };

  const stopCycling = () => {
    if (intervalRef.current == null) return;
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  };

  const startCycling = () => {
    stopCycling();
    // Hold the current mark so CSS can light white tiles before the pool cycles.
    intervalRef.current = window.setInterval(() => {
      if (!alwaysCycleRef.current && !rootRef.current?.matches(":hover")) {
        stopCycling();
        return;
      }
      showNext(alwaysCycleRef.current);
    }, HOVER_CYCLE_MS);
  };

  useEffect(() => {
    if (!alwaysCycle) return;
    startCycling();
    return stopCycling;
  }, [alwaysCycle]);

  useEffect(() => stopCycling, []);

  return (
    <div
      ref={rootRef}
      className={className}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? ariaLabel ?? "Reset canvas" : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onClick();
            }
          : undefined
      }
      onPointerEnter={alwaysCycle ? undefined : startCycling}
      onPointerLeave={alwaysCycle ? undefined : stopCycling}
      onPointerCancel={alwaysCycle ? undefined : stopCycling}
      dangerouslySetInnerHTML={{ __html: pool[index] }}
    />
  );
}
