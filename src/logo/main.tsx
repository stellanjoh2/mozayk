import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/bitcount-grid-single";
import { initUiSounds } from "../ui/sounds";
import { LogoCreator } from "./LogoCreator";

initUiSounds();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LogoCreator />
  </StrictMode>,
);
