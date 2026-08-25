import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/bitcount-grid-single";
import { initUiSounds } from "../ui/sounds";
import { LiveShow } from "./LiveShow";
import "./page.css";

initUiSounds();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LiveShow />
  </StrictMode>,
);
