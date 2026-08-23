import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/bitcount-grid-single";
import { LogoCreator } from "./LogoCreator";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LogoCreator />
  </StrictMode>,
);
