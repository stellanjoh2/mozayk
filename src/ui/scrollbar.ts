const STYLE_ID = "mosaik-scrollbar";

const SCROLLBAR_CSS = `
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.18) transparent;
}

*::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 0;
}

*::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.28);
}

*::-webkit-scrollbar-corner {
  background: transparent;
}
`;

/** Injects the app's thin custom scrollbar styles once. */
export function initScrollbar(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SCROLLBAR_CSS;
  document.head.appendChild(style);
}
