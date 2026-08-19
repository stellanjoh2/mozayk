import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { playUiSound } from "../ui/sounds";
import { TypewriterReveal } from "./TypewriterReveal";

const ABOUT_TEXT =
  "Hi, I'm Stellan Johansson, a creative director and brand designer with 20+ years across games, 3D, motion, UI and visual identity — shipping titles at studios, running agencies, and shaping platforms used by millions of creators. Mozayk is one of my sideprojects.";

const LINKEDIN_URL = "https://www.linkedin.com/in/stellanj/";
const MOBYGAMES_URL = "https://www.mobygames.com/person/289121/stellan-johansson/credits/";
const X_URL = "https://x.com/johstell";
const ORBY_URL = "https://orby.studio/";
const ABOUT_LINKS_TEXT = "LinkedIn · MobyGames · X · Orby";

type AboutOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export function AboutOverlay({ open, onClose }: AboutOverlayProps) {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [linksActive, setLinksActive] = useState(false);
  const [okActive, setOkActive] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLinksActive(false);
      setOkActive(false);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
    setLinksActive(false);
    setOkActive(false);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        playUiSound("close");
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={["about-overlay", entered ? "is-open" : ""].filter(Boolean).join(" ")}
      role="presentation"
      onClick={() => {
        playUiSound("close");
        onClose();
      }}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!open && event.propertyName === "background-color") setMounted(false);
      }}
    >
      <div
        className="about-overlay__scroll"
        role="dialog"
        aria-modal="true"
        aria-label="About Stellan Johansson"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="about-overlay__content">
          <TypewriterReveal
            as="p"
            text={ABOUT_TEXT}
            active={entered}
            playTypeSound
            onComplete={() => setLinksActive(true)}
          />
          <TypewriterReveal
            as="p"
            className="about-overlay__links"
            text={ABOUT_LINKS_TEXT}
            active={entered && linksActive}
            hold
            caret={false}
            playTypeSound
            onComplete={() => setOkActive(true)}
            links={[
              { text: "LinkedIn", href: LINKEDIN_URL },
              { text: "MobyGames", href: MOBYGAMES_URL },
              { text: "X", href: X_URL },
              { text: "Orby", href: ORBY_URL },
            ]}
          />
          <button
            type="button"
            className={["panel-btn", "about-overlay__ok", okActive ? "is-in" : ""]
              .filter(Boolean)
              .join(" ")}
            data-ui-sound="close"
            aria-hidden={!okActive}
            tabIndex={okActive ? 0 : -1}
            onClick={onClose}
          >
            <TypewriterReveal
              as="span"
              text="OK"
              active={entered && okActive}
              hold
              caret={false}
              playTypeSound
            />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
