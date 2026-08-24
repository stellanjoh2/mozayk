import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { formatCount, parseCount } from "./counts";
import { statsApiUrl } from "./beacon";
import { TypewriterReveal } from "../components/TypewriterReveal";

const COUNT_UP_DURATION_S = 2;
const DISCLAIMER =
  "We don’t collect personal data. These numbers are anonymous totals only: we count page loads and when a visual is exported. We don’t identify visitors, we never receive your files, and your browser may use sessionStorage only to avoid double-counting page loads in the same tab (that flag stays on your device).";

type StatsPayload = {
  pageViews?: unknown;
  visualsExported?: unknown;
  configured?: unknown;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion() || value === 0) {
      el.textContent = formatCount(value);
      return;
    }

    const counter = { value: 0 };
    const tween = gsap.to(counter, {
      value,
      duration: COUNT_UP_DURATION_S,
      ease: "power2.out",
      snap: { value: 1 },
      onUpdate: () => {
        el.textContent = formatCount(Math.round(counter.value));
      },
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return (
    <p className="stats-page__value" ref={ref} aria-live="polite">
      0
    </p>
  );
}

export function StatsPage() {
  const [pageViews, setPageViews] = useState(0);
  const [visualsExported, setVisualsExported] = useState(0);
  const [meta, setMeta] = useState("Loading…");
  const [ready, setReady] = useState(false);
  const [titleDone, setTitleDone] = useState(false);
  const [visitsTyped, setVisitsTyped] = useState(false);
  const [exportsTyped, setExportsTyped] = useState(false);
  const [disclaimerActive, setDisclaimerActive] = useState(false);

  useEffect(() => {
    const api = statsApiUrl();
    if (!api) {
      setMeta("Counts unavailable in this environment");
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(api, { method: "GET", mode: "cors" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as StatsPayload;
        if (cancelled) return;
        if (!data?.configured) {
          setMeta("Counts unavailable in this environment");
          setReady(true);
          return;
        }
        setPageViews(parseCount(data.pageViews));
        setVisualsExported(parseCount(data.visualsExported));
        setMeta("All time · Counts update as people use Mozayk");
        setReady(true);
      } catch {
        if (cancelled) return;
        setMeta("Could not load counts right now");
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="stats-page">
      <p className="stats-page__home">
        <a href={import.meta.env.BASE_URL}>Mozayk</a>
      </p>
      <TypewriterReveal
        as="h1"
        text="Statistics"
        active
        playTypeSound
        onComplete={() => setTitleDone(true)}
      />
      <section className="stats-page__totals" aria-label="Usage totals">
        <div className="stats-page__row">
          <TypewriterReveal
            as="p"
            className="stats-page__label"
            text="Site visits"
            active={ready && titleDone}
            hold
            playTypeSound
            onComplete={() => setVisitsTyped(true)}
          />
          {visitsTyped ? (
            <CountUp value={pageViews} />
          ) : (
            <p className="stats-page__value" aria-hidden>
              &nbsp;
            </p>
          )}
        </div>
        <div className="stats-page__row">
          <TypewriterReveal
            as="p"
            className="stats-page__label"
            text="Visuals exported"
            active={visitsTyped}
            hold
            playTypeSound
            onComplete={() => setExportsTyped(true)}
          />
          {exportsTyped ? (
            <CountUp value={visualsExported} />
          ) : (
            <p className="stats-page__value" aria-hidden>
              &nbsp;
            </p>
          )}
        </div>
      </section>
      {exportsTyped ? (
        <TypewriterReveal
          as="p"
          className="stats-page__disclaimer"
          text={DISCLAIMER}
          active
          playTypeSound
          onComplete={() => setDisclaimerActive(true)}
        />
      ) : null}
      {disclaimerActive ? <p className="stats-page__meta">{meta}</p> : null}
    </main>
  );
}
