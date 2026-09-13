import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/bitcount-grid-single";
import { initNormalCursor } from "../ui/cursors";
import { initNormalHoverEffects } from "../ui/hover";
import { initUiSounds } from "../ui/sounds";
import { NotFoundPage } from "./NotFoundPage";
import "./NotFoundPage.css";

initUiSounds();
initNormalHoverEffects();
initNormalCursor();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NotFoundPage />
  </StrictMode>,
);
