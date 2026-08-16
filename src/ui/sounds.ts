const FILES = {
  delete: "sounds/uisound-delete2.wav",
  ok: "sounds/uisound-ok.wav",
  close: "sounds/uisound-close.wav",
  push: "sounds/uisound-ok2.wav",
  slider: "sounds/uisound-slider4.wav",
} as const;

export type UiSound = keyof typeof FILES;

const SOUND_NAMES = Object.keys(FILES) as UiSound[];

/** Linear amplitude gain on top of master volume. -5 dB ≈ 0.562 */
const SOUND_GAIN: Partial<Record<UiSound, number>> = {
  delete: 10 ** (-5 / 20),
};

const STORAGE_KEY = "mozayk-ui-sounds";

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

function soundUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

type WindowWithWebkit = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioCtx: AudioContext | null = null;
const rawFiles = new Map<UiSound, ArrayBuffer>();
const decoded = new Map<UiSound, AudioBuffer>();
const loadingRaw = new Map<UiSound, Promise<ArrayBuffer | null>>();
const loadingDecoded = new Map<UiSound, Promise<AudioBuffer | null>>();
let sliderUntil = 0;

function createAudioContext(): AudioContext | null {
  const AC = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!AC) return null;
  return new AC();
}

function audioContext(): AudioContext | null {
  if (audioCtx && audioCtx.state !== "closed") return audioCtx;
  decoded.clear();
  audioCtx = createAudioContext();
  return audioCtx;
}

/** Resume the shared context. Call from a user gesture when possible. */
function unlockAudio(): AudioContext | null {
  const ctx = audioContext();
  if (!ctx) return null;
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

async function loadRaw(name: UiSound): Promise<ArrayBuffer | null> {
  const cached = rawFiles.get(name);
  if (cached) return cached;
  const inflight = loadingRaw.get(name);
  if (inflight) return inflight;
  const promise = (async () => {
    try {
      const res = await fetch(soundUrl(FILES[name]));
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      rawFiles.set(name, data);
      return data;
    } catch {
      return null;
    } finally {
      loadingRaw.delete(name);
    }
  })();
  loadingRaw.set(name, promise);
  return promise;
}

async function bufferFor(name: UiSound): Promise<AudioBuffer | null> {
  const cached = decoded.get(name);
  if (cached) return cached;
  const inflight = loadingDecoded.get(name);
  if (inflight) return inflight;
  const promise = (async () => {
    const ctx = audioContext();
    const raw = await loadRaw(name);
    if (!ctx || ctx.state === "closed" || !raw) return null;
    try {
      const buf = await ctx.decodeAudioData(raw.slice(0));
      decoded.set(name, buf);
      return buf;
    } catch {
      decoded.delete(name);
      return null;
    } finally {
      loadingDecoded.delete(name);
    }
  })();
  loadingDecoded.set(name, promise);
  return promise;
}

function startSound(name: UiSound, buf: AudioBuffer): void {
  const ctx = unlockAudio();
  if (!ctx || ctx.state === "closed") return;
  const play = () => {
    if (!prefs.enabled || prefs.volume <= 0 || ctx.state !== "running") return;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const gain = ctx.createGain();
    const amp = SOUND_GAIN[name] ?? 1;
    gain.gain.value = Math.min(1, (prefs.volume / 100) * amp);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    if (name === "slider") {
      sliderUntil = performance.now() + Math.max(buf.duration * 1000, 30);
    }
  };
  if (ctx.state === "running") {
    play();
    return;
  }
  void ctx.resume().then(() => {
    if (ctx.state === "running") play();
  }).catch(() => {});
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
  if (enabled) unlockAudio();
}

export function setUiSoundsVolume(volume: number): void {
  prefs = { ...prefs, volume: clampVolume(volume) };
  savePrefs();
}

export function playUiSound(name: UiSound): void {
  if (!prefs.enabled || prefs.volume <= 0) return;
  if (name === "slider") {
    sliderUntil = Math.max(sliderUntil, performance.now() + 50);
  }
  const ctx = unlockAudio();
  if (!ctx) return;
  const ready = decoded.get(name);
  if (ready) {
    try {
      startSound(name, ready);
      return;
    } catch {
      decoded.delete(name);
    }
  }
  void bufferFor(name).then((buf) => {
    if (!buf || !prefs.enabled || prefs.volume <= 0) return;
    startSound(name, buf);
  });
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
  if (rangeDragging && performance.now() < sliderUntil) return;
  playUiSound("slider");
}

function onUnlockGesture(): void {
  if (!prefs.enabled) return;
  unlockAudio();
  for (const name of SOUND_NAMES) {
    if (!decoded.has(name)) void bufferFor(name);
  }
}

/** Preloads UI sounds and keeps the audio context alive while Sounds are on. */
export function initUiSounds(): void {
  for (const name of SOUND_NAMES) void loadRaw(name);
  document.addEventListener("pointerdown", onUnlockGesture, true);
  document.addEventListener("keydown", onUnlockGesture, true);
  document.addEventListener("click", onPanelBtnClick);
  document.addEventListener("pointerdown", onRangePointerDown);
  document.addEventListener("pointerup", onRangePointerUp);
  document.addEventListener("pointercancel", onRangePointerUp);
  document.addEventListener("input", onRangeInput);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && prefs.enabled) unlockAudio();
  });
  window.addEventListener("pageshow", () => {
    if (prefs.enabled) unlockAudio();
  });
  window.addEventListener("focus", () => {
    if (prefs.enabled) unlockAudio();
  });
}
