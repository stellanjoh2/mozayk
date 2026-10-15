import { useState, type CSSProperties } from "react";
import stackedLogoSvg from "../assets/mozayk_logo_stacked.svg?raw";
import { generateRandomPalette } from "../layout/generateLayout";
import { paintLogoWithBrandTokens } from "../logo/paintLogo";
import {
  DEFAULT_LOGO_SHAPES,
  LOGO_SHAPE_IDS,
  type LogoShapeId,
} from "../logo/logoShapes";
import { playUiSound } from "../ui/sounds";
import "./MobileGateLogo.css";

/** Brand chromatic defaults — match Logo Creator / brand.css. */
const DEFAULT_CHROMATIC = ["#2e1ebc", "#cf41f2", "#ff5300"] as const;
const LOGO_WHITE = "#ffffff";

function pickRandomShapes(): LogoShapeId[] {
  // Mostly the classic trio; sometimes fold in creator extras like a random R+strip mix.
  if (Math.random() < 0.55) return [...DEFAULT_LOGO_SHAPES];
  const picked = LOGO_SHAPE_IDS.filter(() => Math.random() < 0.45);
  return picked.length > 0 ? picked : [...DEFAULT_LOGO_SHAPES];
}

function paintStackedMark(shapes: readonly LogoShapeId[], subdivide: boolean): string {
  return paintLogoWithBrandTokens(stackedLogoSvg, { shapes, subdivide });
}

function buildInitial(): { markup: string; colors: string[] } {
  return {
    markup: paintStackedMark(DEFAULT_LOGO_SHAPES, false),
    colors: [...DEFAULT_CHROMATIC],
  };
}

export function MobileGateLogo({
  onClick,
  ariaLabel = "Randomize logotype",
}: {
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const [mark, setMark] = useState(buildInitial);

  const style = {
    "--logo-fill-1": mark.colors[0],
    "--logo-fill-2": mark.colors[1],
    "--logo-fill-3": mark.colors[2],
    "--logo-fill-4": LOGO_WHITE,
  } as CSSProperties;

  const randomize = () => {
    playUiSound("push");
    setMark({
      markup: paintStackedMark(pickRandomShapes(), Math.random() < 0.35),
      colors: generateRandomPalette(3),
    });
    onClick?.();
  };

  return (
    <div
      className="mobile-gate-logo"
      style={style}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={randomize}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        randomize();
      }}
      dangerouslySetInnerHTML={{ __html: mark.markup }}
    />
  );
}
