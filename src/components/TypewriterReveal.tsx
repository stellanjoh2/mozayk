import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { playUiSound } from "../ui/sounds";

type IntrinsicTag = keyof React.JSX.IntrinsicElements;

export type TypewriterLink = {
  text: string;
  href: string;
};

type TypewriterRevealProps = {
  as?: IntrinsicTag;
  text: string;
  active?: boolean;
  /** Delete characters instead of adding them. */
  reverse?: boolean;
  speedMs?: number;
  caret?: boolean;
  playTypeSound?: boolean;
  hold?: boolean;
  className?: string;
  links?: TypewriterLink[];
  /** Substrings to paint with the accent colour (e.g. keyboard keys). */
  keys?: readonly string[];
  onComplete?: () => void;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">;

const DEFAULT_SPEED_MS = 10;

type TextHit =
  | { start: number; end: number; kind: "link"; href: string }
  | { start: number; end: number; kind: "key" };

function isAlphanumericKey(key: string): boolean {
  return /^[A-Za-z0-9]+$/.test(key);
}

function collectKeyHits(value: string, keys: readonly string[]): TextHit[] {
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  const claimed = new Array<boolean>(value.length).fill(false);
  const hits: TextHit[] = [];

  for (const key of sorted) {
    if (!key) continue;
    let from = 0;
    while (from < value.length) {
      const index = value.indexOf(key, from);
      if (index === -1) break;
      const end = index + key.length;
      if (isAlphanumericKey(key)) {
        const beforeOk =
          index === 0 || !/[A-Za-z0-9]/.test(value[index - 1] ?? "");
        const afterOk =
          end >= value.length || !/[A-Za-z0-9]/.test(value[end] ?? "");
        if (!beforeOk || !afterOk) {
          from = index + 1;
          continue;
        }
      }
      if (claimed.slice(index, end).some(Boolean)) {
        from = end;
        continue;
      }
      for (let i = index; i < end; i += 1) claimed[i] = true;
      hits.push({ start: index, end, kind: "key" });
      from = end;
    }
  }
  return hits;
}

function renderTypedText(
  value: string,
  links: TypewriterLink[] | undefined,
  keys: readonly string[] | undefined,
) {
  if (!links?.length && !keys?.length) return value;

  const hits: TextHit[] = [];
  if (links?.length) {
    for (const link of links) {
      let from = 0;
      while (from < value.length) {
        const index = value.indexOf(link.text, from);
        if (index === -1) break;
        hits.push({
          start: index,
          end: index + link.text.length,
          kind: "link",
          href: link.href,
        });
        from = index + link.text.length;
      }
    }
  }
  if (keys?.length) hits.push(...collectKeyHits(value, keys));
  hits.sort((a, b) => a.start - b.start || b.end - a.end);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, key) => {
    if (hit.start < cursor) return;
    if (hit.start > cursor) nodes.push(value.slice(cursor, hit.start));
    const slice = value.slice(hit.start, hit.end);
    if (hit.kind === "link") {
      nodes.push(
        <a key={key} href={hit.href} target="_blank" rel="noopener noreferrer">
          {slice}
        </a>,
      );
    } else {
      nodes.push(
        <span key={key} className="typewriter-reveal__key">
          {slice}
        </span>,
      );
    }
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
  reverse = false,
  speedMs = DEFAULT_SPEED_MS,
  caret = true,
  playTypeSound = false,
  hold = false,
  className,
  links,
  keys,
  onComplete,
  ...restProps
}: TypewriterRevealProps) {
  const Tag = as as React.ElementType;
  const idleText = reverse || !hold ? text : "";
  const [typed, setTyped] = useState(active ? (reverse ? text : "") : idleText);
  const [isComplete, setIsComplete] = useState(!active && !hold);
  const combinedClassName = ["typewriter-reveal", className]
    .filter(Boolean)
    .join(" ");

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const playTypeSoundRef = useRef(playTypeSound);
  playTypeSoundRef.current = playTypeSound;
  /** Only the latest activation may call onComplete. */
  const runIdRef = useRef(0);

  const reduceMotion = useMemo(() => {
    return (
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    );
  }, []);

  useEffect(() => {
    const runId = ++runIdRef.current;

    const complete = () => {
      if (runId !== runIdRef.current) return;
      setIsComplete(true);
      onCompleteRef.current?.();
    };

    if (!active) {
      if (reverse) {
        setTyped(text);
        setIsComplete(false);
      } else {
        setTyped(hold ? "" : text);
        setIsComplete(!hold);
      }
      return;
    }

    if (reduceMotion) {
      setTyped(reverse ? "" : text);
      complete();
      return;
    }

    if (reverse) {
      setTyped(text);
      setIsComplete(false);
      if (text.length === 0) {
        complete();
        return;
      }
      let i = text.length;
      const timer = window.setInterval(() => {
        if (runId !== runIdRef.current) {
          window.clearInterval(timer);
          return;
        }
        i -= 1;
        setTyped(text.slice(0, Math.max(0, i)));
        if (playTypeSoundRef.current && i >= 0 && isWordStart(text, i)) {
          playUiSound("hover", true);
        }
        if (i <= 0) {
          window.clearInterval(timer);
          complete();
        }
      }, speedMs);
      return () => {
        window.clearInterval(timer);
        // Invalidate so a mid-flight tick / Strict Mode remount cannot complete.
        if (runId === runIdRef.current) runIdRef.current += 1;
      };
    }

    setTyped("");
    setIsComplete(false);
    if (text.length === 0) {
      complete();
      return;
    }

    let i = 0;
    const timer = window.setInterval(() => {
      if (runId !== runIdRef.current) {
        window.clearInterval(timer);
        return;
      }
      const next = i;
      i += 1;
      setTyped(text.slice(0, i));
      if (playTypeSoundRef.current && isWordStart(text, next)) {
        playUiSound("hover", true);
      }
      if (i >= text.length) {
        window.clearInterval(timer);
        complete();
      }
    }, speedMs);

    return () => {
      window.clearInterval(timer);
      if (runId === runIdRef.current) runIdRef.current += 1;
    };
    // playTypeSound is read from a ref so toggling sound mid-run does not restart.
  }, [active, hold, reduceMotion, reverse, speedMs, text]);

  return (
    <Tag className={combinedClassName} {...restProps}>
      <span className="typewriter-reveal__ghost" aria-hidden>
        {renderTypedText(text, links, keys)}
      </span>
      <span className="typewriter-reveal__live">
        {renderTypedText(typed, links, keys)}
        {caret && !isComplete ? (
          <span className="typewriter-reveal__caret" aria-hidden />
        ) : null}
      </span>
    </Tag>
  );
}
