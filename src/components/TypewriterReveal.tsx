import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { playUiSound } from "../ui/sounds";

type IntrinsicTag = keyof React.JSX.IntrinsicElements;

// Keep props typing simple: we only rely on generic HTML attrs like `id` / `className`.
type TypewriterRevealProps = {
  as?: IntrinsicTag;
  text: string;
  active?: boolean;
  speedMs?: number;
  caret?: boolean;
  playTypeSound?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">;

const DEFAULT_SPEED_MS = 10;

export function TypewriterReveal({
  as = "span",
  text,
  active = true,
  speedMs = DEFAULT_SPEED_MS,
  caret = true,
  playTypeSound = false,
  className,
  ...restProps
}: TypewriterRevealProps) {
  const Tag = as as React.ElementType;
  const [typed, setTyped] = useState(active ? "" : text);
  const [isComplete, setIsComplete] = useState(!active);
  const combinedClassName = ["typewriter-reveal", className].filter(Boolean).join(" ");

  const reduceMotion = useMemo(() => {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  useEffect(() => {
    if (!active) {
      setTyped(text);
      setIsComplete(true);
      return;
    }

    if (reduceMotion) {
      setTyped(text);
      setIsComplete(true);
      return;
    }

    setTyped("");
    setIsComplete(false);

    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (playTypeSound) playUiSound("hover");
      if (i >= text.length) {
        window.clearInterval(timer);
        setIsComplete(true);
      }
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [active, playTypeSound, reduceMotion, speedMs, text]);

  return (
    <Tag className={combinedClassName} {...restProps}>
      <span className="typewriter-reveal__ghost" aria-hidden>
        {text}
      </span>
      <span className="typewriter-reveal__live">
        {typed}
        {caret && !isComplete ? (
          <span className="typewriter-reveal__caret" aria-hidden />
        ) : null}
      </span>
    </Tag>
  );
}

