const FILES = {
  delete: "sounds/uisound-delete2.wav",
  ok: "sounds/uisound-ok.wav",
  close: "sounds/uisound-close.wav",
  push: "sounds/uisound-push.wav",
} as const;

export type UiSound = keyof typeof FILES;

const cache = new Map<UiSound, HTMLAudioElement>();

function soundUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

function audioFor(name: UiSound): HTMLAudioElement {
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(soundUrl(FILES[name]));
    audio.preload = "auto";
    cache.set(name, audio);
  }
  return audio;
}

export function playUiSound(name: UiSound): void {
  const audio = audioFor(name);
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

function onPanelBtnClick(event: Event): void {
  const el = event.target;
  if (!(el instanceof Element)) return;
  const btn = el.closest(".panel-btn");
  if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
  playUiSound("push");
}

/** Preloads UI sounds. */
export function initUiSounds(): void {
  audioFor("delete");
  audioFor("ok");
  audioFor("close");
  audioFor("push");
  document.addEventListener("click", onPanelBtnClick);
}
