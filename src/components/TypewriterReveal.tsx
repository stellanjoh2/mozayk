import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { playUiSound } from "../ui/sounds";

type IntrinsicTag = keyof React.JSX.IntrinsicElements;

export type TypewriterLink = {
  text: string;
  href: string;
};

// Keep props typing simple: we only rely on generic HTML attrs like `id` / `className`.
type TypewriterRevealProps = {
  as?: IntrinsicTag;
  text: string;
  active?: boolean;
  speedMs?: number;
  caret?: boolean;
  playTypeSound?: boolean;
  hold?: boolean;
  className?: string;
  links?: TypewriterLink[];
  onComplete?: () => void;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">;

const DEFAULT_SPEED_MS = 10;

function renderWithLinks(value: string, links: TypewriterLink[] | undefined) {
  if (!links?.length) return value;

  const hits: { start: number; end: number; href: string }[] = [];
  for (const link of links) {
    let from = 0;
    while (from < value.length) {
      const index = value.indexOf(link.text, from);
      if (index === -1) break;
      hits.push({ start: index, end: index + link.text.length, href: link.href });
      from = index + link.text.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, key) => {
    if (hit.start < cursor) return;
    if (hit.start > cursor) nodes.push(value.slice(cursor, hit.start));
    nodes.push(
      <a key={key} href={hit.href} target="_blank" rel="noopener noreferrer">
        {value.slice(hit.start, hit.end)}
      </a>,
    );
    cursor = hit.end;
  });
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function isWordStart(text: string, index: number) {
  const ch = text[index];
  if (!ch || /\s/.test(ch)) return false;
  return index === 0 || /\s/.test(text[index - 1]);
}

export function TypewriterReveal({
  as = "span",
  text,
  active = true,
  speedMs = DEFAULT_SPEED_MS,
  caret = true,
  playTypeSound = false,
  hold = false,
  className,
  links,
  onComplete,
  ...restProps
}: TypewriterRevealProps) {
  const Tag = as as React.ElementType;
  const idleText = hold ? "" : text;
  const [typed, setTyped] = useState(active ? "" : idleText);
  const [isComplete, setIsComplete] = useState(!active && !hold);
  const combinedClassName = ["typewriter-reveal", className].filter(Boolean).join(" ");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const reduceMotion = useMemo(() => {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }, []);

  useEffect(() => {
    if (!active) {
      setTyped(hold ? "" : text);
      setIsComplete(!hold);
      return;
    }

    if (reduceMotion) {
      setTyped(text);
      setIsComplete(true);
      onCompleteRef.current?.();
      return;
    }

    setTyped("");
    setIsComplete(false);

    let i = 0;
    const timer = window.setInterval(() => {
      const next = i;
      i += 1;
      setTyped(text.slice(0, i));
      if (playTypeSound && isWordStart(text, next)) playUiSound("hover", true);
      if (i >= text.length) {
        window.clearInterval(timer);
        setIsComplete(true);
        onCompleteRef.current?.();
      }
    }, speedMs);

    return () => window.clearInterval(timer);
  }, [active, hold, playTypeSound, reduceMotion, speedMs, text]);

  return (
    <Tag className={combinedClassName} {...restProps}>
      <span className="typewriter-reveal__ghost" aria-hidden>
        {renderWithLinks(text, links)}
      </span>
      <span className="typewriter-reveal__live">
        {renderWithLinks(typed, links)}
        {caret && !isComplete ? (
          <span className="typewriter-reveal__caret" aria-hidden />
        ) : null}
      </span>
    </Tag>
  );
}
