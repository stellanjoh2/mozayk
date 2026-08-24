import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/bitcount-grid-single";
import { initNormalCursor } from "../ui/cursors";
import { initNormalHoverEffects } from "../ui/hover";
import { initScrollbar } from "../ui/scrollbar";
import { initUiSounds } from "../ui/sounds";
import { StatsPage } from "./StatsPage";
import "./StatsPage.css";

initScrollbar();
initUiSounds();
initNormalHoverEffects();
initNormalCursor();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StatsPage />
  </StrictMode>,
);
