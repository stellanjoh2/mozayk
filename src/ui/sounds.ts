const FILES = {
  delete: "sounds/uisound-delete2.wav",
  ok: "sounds/uisound-ok.wav",
  close: "sounds/uisound-close.wav",
  push: "sounds/uisound-ok2.wav",
  slider: "sounds/uisound-slider4.wav",
} as const;

export type UiSound = keyof typeof FILES;

const STORAGE_KEY = "mozayk-ui-sounds";
const cache = new Map<UiSound, HTMLAudioElement>();

type UiSoundPrefs = { enabled: boolean; volume: number };

function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function loadPrefs(): UiSoundPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, volume: 100 };
    const parsed = JSON.parse(raw) as Partial<UiSoundPrefs>;
    return {
      enabled: parsed.enabled !== false,
      volume: clampVolume(Number(parsed.volume ?? 100)),
    };
  } catch {
    return { enabled: true, volume: 100 };
  }
}

let prefs = loadPrefs();

function savePrefs(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function applyVolume(audio: HTMLAudioElement): void {
  audio.volume = prefs.volume / 100;
}

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
  applyVolume(audio);
  return audio;
}

export function getUiSoundsEnabled(): boolean {
  return prefs.enabled;
}

export function getUiSoundsVolume(): number {
  return prefs.volume;
}

export function setUiSoundsEnabled(enabled: boolean): void {
  prefs = { ...prefs, enabled };
  savePrefs();
}

export function setUiSoundsVolume(volume: number): void {
  prefs = { ...prefs, volume: clampVolume(volume) };
  savePrefs();
  for (const audio of cache.values()) applyVolume(audio);
}

export function playUiSound(name: UiSound): void {
  if (!prefs.enabled || prefs.volume <= 0) return;
  const audio = audioFor(name);
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}

function onPanelBtnClick(event: Event): void {
  const el = event.target;
  if (!(el instanceof Element)) return;
  const btn = el.closest(".panel-btn");
  if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
  const cue = btn.dataset.uiSound;
  if (cue && cue in FILES) {
    playUiSound(cue as UiSound);
    return;
  }
  playUiSound("push");
}

function isRangeInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "range" && !el.disabled;
}

let rangeDragging = false;

function onRangePointerDown(event: Event): void {
  if (!isRangeInput(event.target)) return;
  rangeDragging = true;
  playUiSound("slider");
}

function onRangePointerUp(): void {
  rangeDragging = false;
}

function onRangeInput(event: Event): void {
  if (!isRangeInput(event.target)) return;
  const audio = cache.get("slider");
  if (rangeDragging && audio && !audio.paused) return;
  playUiSound("slider");
}

/** Preloads UI sounds. */
export function initUiSounds(): void {
  audioFor("delete");
  audioFor("ok");
  audioFor("close");
  audioFor("push");
  audioFor("slider");
  document.addEventListener("click", onPanelBtnClick);
  document.addEventListener("pointerdown", onRangePointerDown);
  document.addEventListener("pointerup", onRangePointerUp);
  document.addEventListener("pointercancel", onRangePointerUp);
  document.addEventListener("input", onRangeInput);
}
