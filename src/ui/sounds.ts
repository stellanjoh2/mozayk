const FILES = {
  delete: "sounds/uisound-delete.wav",
  ok: "sounds/uisound-close.wav",
  close: "sounds/uisound-ok.wav",
  push: "sounds/uisound-push.wav",
  slider: "sounds/uisound-slider.wav",
  sliderLeft: "sounds/uisound-slider.wav",
  hover: "sounds/uisound-hover.wav",
  drop: "sounds/uisound-drop.wav",
  tip1: "sounds/protip-01.wav",
  tip2: "sounds/protip-02.wav",
  tip3: "sounds/protip-03.wav",
  tip4: "sounds/protip-04.wav",
  tip5: "sounds/protip-05.wav",
  tip6: "sounds/protip-06.wav",
  tip7: "sounds/protip-07.wav",
  hint1: "sounds/hint-01.wav",
  general1: "sounds/voice-general01.wav",
  general2: "sounds/voice-general02.wav",
  general3: "sounds/voice-general03.wav",
  // hoverBlink: "sounds/uisound-hoverblink.wav",
} as const;

const HOVER_SELECTOR =
  ".panel-btn, .button-row button, .timeline__controls button, .canvas-stage-control-btn, .frame-context-menu__item, .ui-icon-btn, .controls-panel__tab, .palette-panel__tab, .palette-panel__close, .palette-gallery__item, .timeline-thumb, .ui-switch, .headline-disclosure, .about-overlay__content a, .stats-page a, .logo-creator__chrome button";

export type UiSound = keyof typeof FILES;

const SOUND_NAMES = Object.keys(FILES) as UiSound[];

/** Per-cue gain matched to median RMS (−29 dBFS), peak-limited to −6 dBFS. */
const SOUND_GAIN: Partial<Record<UiSound, number>> = {
  delete: 0.9958 * 10 ** (-10 / 20),
  ok: 1.0,
  close: 10 ** (-2 / 20),
  push: 3.5818 * 10 ** (-10 / 20),
  slider: 0.7532,
  sliderLeft: 0.7532,
  hover: 0.9189 * 10 ** (5 / 20),
  drop: 1.8205 * 10 ** (-5 / 20),
  tip1: 1,
  tip2: 1,
  tip3: 1,
  tip4: 1,
  tip5: 1,
  tip6: 1,
  tip7: 1,
  hint1: 1,
  general1: 1,
  general2: 1,
  general3: 1,
  // hoverBlink: 5.8449 * 10 ** (-20 / 20),
};

/** Left-drag reuses the slider clip a half octave down. */
const PLAYBACK_RATE: Partial<Record<UiSound, number>> = {
  sliderLeft: 2 ** -0.5,
};

const STORAGE_KEY = "mozayk-ui-sounds";

type UiSoundPrefs = { enabled: boolean; volume: number };

function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function loadPrefs(): UiSoundPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, volume: 80 };
    const parsed = JSON.parse(raw) as Partial<UiSoundPrefs>;
    return {
      enabled: parsed.enabled !== false,
      volume: clampVolume(Number(parsed.volume ?? 80)),
    };
  } catch {
    return { enabled: true, volume: 80 };
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
let sliderPlaying = false;
let sliderToken = 0;
let hoverUntil = 0;
const HOVER_MIN_INTERVAL_MS = 120;

/** Spoken tips/hints — only one may play at a time; new cues wait until it finishes. */
export type VoiceSound =
  | "tip1"
  | "tip2"
  | "tip3"
  | "tip4"
  | "tip5"
  | "tip6"
  | "tip7"
  | "hint1"
  | "general1"
  | "general2"
  | "general3";

function isVoiceSound(name: UiSound): name is VoiceSound {
  return (
    name === "tip1" ||
    name === "tip2" ||
    name === "tip3" ||
    name === "tip4" ||
    name === "tip5" ||
    name === "tip6" ||
    name === "tip7" ||
    name === "hint1" ||
    name === "general1" ||
    name === "general2" ||
    name === "general3"
  );
}

type ActiveVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  token: number;
};

let activeVoice: ActiveVoice | null = null;
let voiceToken = 0;

export function isVoicePlaying(): boolean {
  return activeVoice != null;
}

/** Stop any in-flight spoken tip/hint (e.g. when its popup is dismissed). */
export function stopVoiceSound(): void {
  const current = activeVoice;
  if (!current) return;
  activeVoice = null;
  const { source, gain } = current;
  try {
    const ctx = gain.context;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.04);
    source.stop(now + 0.05);
  } catch {
    /* already stopped */
  }
}

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
  if (!import.meta.env.DEV) {
    const cached = rawFiles.get(name);
    if (cached) return cached;
    const inflight = loadingRaw.get(name);
    if (inflight) return inflight;
  }
  const promise = (async () => {
    try {
      const url = soundUrl(FILES[name]);
      const res = await fetch(
        import.meta.env.DEV ? `${url}?t=${Date.now()}` : url,
      );
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      if (!import.meta.env.DEV) rawFiles.set(name, data);
      return data;
    } catch {
      return null;
    } finally {
      if (!import.meta.env.DEV) loadingRaw.delete(name);
    }
  })();
  if (!import.meta.env.DEV) loadingRaw.set(name, promise);
  return promise;
}

async function bufferFor(name: UiSound): Promise<AudioBuffer | null> {
  if (!import.meta.env.DEV) {
    const cached = decoded.get(name);
    if (cached) return cached;
    const inflight = loadingDecoded.get(name);
    if (inflight) return inflight;
  }
  const promise = (async () => {
    const ctx = audioContext();
    const raw = await loadRaw(name);
    if (!ctx || ctx.state === "closed" || !raw) return null;
    try {
      const buf = await ctx.decodeAudioData(raw.slice(0));
      if (!import.meta.env.DEV) decoded.set(name, buf);
      return buf;
    } catch {
      if (!import.meta.env.DEV) decoded.delete(name);
      return null;
    } finally {
      if (!import.meta.env.DEV) loadingDecoded.delete(name);
    }
  })();
  if (!import.meta.env.DEV) loadingDecoded.set(name, promise);
  return promise;
}

function isSliderSound(name: UiSound): boolean {
  return name === "slider" || name === "sliderLeft";
}

function releaseSliderSound(token: number): void {
  if (token !== sliderToken) return;
  sliderPlaying = false;
}

function startSound(name: UiSound, buf: AudioBuffer): boolean {
  const ctx = unlockAudio();
  const token = sliderToken;
  if (!ctx || ctx.state === "closed") {
    if (isSliderSound(name)) releaseSliderSound(token);
    return false;
  }
  const play = (): boolean => {
    if (!prefs.enabled || prefs.volume <= 0 || ctx.state !== "running") {
      if (isSliderSound(name)) releaseSliderSound(token);
      return false;
    }
    // Let the first spoken cue finish — do not cut it off for a newer one.
    if (isVoiceSound(name) && activeVoice) return false;
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const rate = PLAYBACK_RATE[name] ?? 1;
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    const amp = SOUND_GAIN[name] ?? 1;
    gain.gain.value = (prefs.volume / 100) * amp;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    if (isVoiceSound(name)) {
      voiceToken += 1;
      const myToken = voiceToken;
      activeVoice = { source, gain, token: myToken };
      source.onended = () => {
        if (activeVoice?.token === myToken) activeVoice = null;
      };
    }
    if (isSliderSound(name)) {
      const unlock = () => releaseSliderSound(token);
      source.onended = unlock;
      window.setTimeout(unlock, Math.max((buf.duration / rate) * 1000, 30));
    }
    if (name === "drop") {
      hoverUntil = Math.max(
        hoverUntil,
        performance.now() + Math.max((buf.duration / rate) * 1000, 80),
      );
    }
    return true;
  };
  if (ctx.state === "running") {
    return play();
  }
  void ctx.resume().then(() => {
    if (ctx.state === "running") play();
    else if (isSliderSound(name)) releaseSliderSound(token);
  }).catch(() => {
    if (isSliderSound(name)) releaseSliderSound(token);
  });
  // Resume is async — treat as accepted if we queued play.
  return !isVoiceSound(name) || !activeVoice;
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

export function playUiSound(name: UiSound, unthrottled = false): void {
  if (!prefs.enabled || prefs.volume <= 0) return;
  if (name === "hover" && !unthrottled) {
    const now = performance.now();
    if (now < hoverUntil) return;
    hoverUntil = now + HOVER_MIN_INTERVAL_MS;
  }
  if (isSliderSound(name)) {
    if (sliderPlaying) return;
    sliderPlaying = true;
    sliderToken += 1;
  }
  const token = sliderToken;
  if (name === "drop") {
    hoverUntil = Math.max(hoverUntil, performance.now() + 400);
  }
  const ctx = unlockAudio();
  if (!ctx) {
    if (isSliderSound(name)) releaseSliderSound(token);
    return;
  }
  const ready = import.meta.env.DEV ? undefined : decoded.get(name);
  if (ready) {
    try {
      startSound(name, ready);
      return;
    } catch {
      decoded.delete(name);
      if (isSliderSound(name)) releaseSliderSound(token);
    }
  }
  void bufferFor(name).then((buf) => {
    if (!buf || !prefs.enabled || prefs.volume <= 0) {
      if (isSliderSound(name)) releaseSliderSound(token);
      return;
    }
    startSound(name, buf);
  });
}

/** Await decode + context resume — better for longer spoken tips. */
export async function playUiSoundAsync(name: UiSound): Promise<boolean> {
  if (!prefs.enabled || prefs.volume <= 0) return false;
  if (isVoiceSound(name) && activeVoice) return false;
  const ctx = unlockAudio();
  if (!ctx) return false;
  try {
    if (ctx.state !== "running") await ctx.resume();
  } catch {
    return false;
  }
  const buf = await bufferFor(name);
  if (!buf || !prefs.enabled || prefs.volume <= 0) return false;
  if (isVoiceSound(name) && activeVoice) return false;
  try {
    if (ctx.state !== "running") await ctx.resume();
  } catch {
    return false;
  }
  if (ctx.state !== "running") return false;
  return startSound(name, buf);
}

/** If autoplay is blocked, play once on the next pointer/key gesture. */
export function playUiSoundOnNextGesture(
  name: UiSound,
  onStarted?: () => void,
): () => void {
  let cleaned = false;
  const teardown = () => {
    if (cleaned) return;
    cleaned = true;
    document.removeEventListener("pointerdown", onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
  };
  const tryPlay = () =>
    playUiSoundAsync(name).then((ok) => {
      if (!ok) return false;
      onStarted?.();
      teardown();
      return true;
    });
  const onGesture = () => {
    void tryPlay();
  };
  void tryPlay().then((ok) => {
    if (ok) return;
    // Busy voice: do not queue a late replay on the next click.
    if (isVoiceSound(name) && activeVoice) {
      teardown();
      return;
    }
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
  });
  return teardown;
}

function shouldPlayHover(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el.classList.contains("is-on")) return false;
  if (el.classList.contains("is-sole")) return false;
  if (el.classList.contains("ui-switch")) {
    const input = el.querySelector("input");
    if (input instanceof HTMLInputElement && input.disabled) return false;
  }
  if (!el.classList.contains("is-active")) return true;
  if (
    el.classList.contains("controls-panel__tab") ||
    el.classList.contains("palette-panel__tab") ||
    el.classList.contains("timeline-thumb") ||
    el.classList.contains("palette-gallery__item")
  ) {
    return false;
  }
  return !el.closest(".button-row--choice");
}

function onButtonHover(event: MouseEvent): void {
  if (document.querySelector(".live-show")) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const el = target.closest(HOVER_SELECTOR);
  if (!(el instanceof HTMLElement) || !shouldPlayHover(el)) return;
  const related = event.relatedTarget;
  if (related instanceof Node && el.contains(related)) return;
  if (performance.now() < hoverUntil) return;
  playUiSound("hover");
}

// const BLINK_ANIMATIONS = new Set(["hover-plate-blink", "hover-border-blink"]);
//
// function onHoverBlink(event: Event): void {
//   if (!(event instanceof AnimationEvent)) return;
//   if (!BLINK_ANIMATIONS.has(event.animationName)) return;
//   playUiSound("hoverBlink");
// }

const SHORTCUT_PRESS_MS = 120;
const shortcutPressTimers = new Map<string, number>();

function playButtonCue(btn: Element): void {
  if (btn instanceof HTMLButtonElement && btn.disabled) return;
  const cue = btn instanceof HTMLElement ? btn.dataset.uiSound : undefined;
  if (cue && cue in FILES) {
    playUiSound(cue as UiSound);
    return;
  }
  playUiSound("push");
}

function shortcutButton(code: string): HTMLElement | null {
  const el = document.querySelector(`[data-shortcut="${CSS.escape(code)}"]`);
  if (!(el instanceof HTMLElement)) return null;
  if (el instanceof HTMLButtonElement && el.disabled) return null;
  return el;
}

function setShortcutPressed(code: string, pressed: boolean): void {
  const el = shortcutButton(code);
  if (!el) return;
  el.classList.toggle("is-pressed", pressed);
}

/** Press-flash a shortcut's button and play the same cue a pointer click would. */
export function triggerShortcutButton(
  code: string,
  fallbackSound: UiSound = "push",
): void {
  const btn = shortcutButton(code);
  if (!btn) {
    playUiSound(fallbackSound);
    return;
  }
  playButtonCue(btn);

  const prev = shortcutPressTimers.get(code);
  if (prev !== undefined) window.clearTimeout(prev);

  const arm = () => setShortcutPressed(code, true);
  arm();
  requestAnimationFrame(() => {
    arm();
    requestAnimationFrame(() => {
      arm();
      shortcutPressTimers.set(
        code,
        window.setTimeout(() => {
          setShortcutPressed(code, false);
          shortcutPressTimers.delete(code);
        }, SHORTCUT_PRESS_MS),
      );
    });
  });
}

function onPanelBtnClick(event: Event): void {
  const el = event.target;
  if (!(el instanceof Element)) return;
  const btn = el.closest(".panel-btn, .palette-panel__close, .logo-creator__chrome button");
  if (btn instanceof HTMLButtonElement && !btn.disabled) {
    playButtonCue(btn);
    return;
  }

  const choiceBtn = el.closest(
    ".controls-panel__tab, .palette-panel__tab, .button-row--choice button, .palette-gallery__item, .timeline-thumb",
  );
  if (
    choiceBtn instanceof HTMLButtonElement &&
    !choiceBtn.disabled &&
    !choiceBtn.classList.contains("is-active")
  ) {
    playUiSound("push");
  }
}

function isRangeInput(el: EventTarget | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.type === "range" && !el.disabled;
}

const lastRangeValues = new WeakMap<HTMLInputElement, number>();

function snapshotRangeValue(el: HTMLInputElement): void {
  lastRangeValues.set(el, Number(el.value));
}

function playRangeSliderSound(el: HTMLInputElement): void {
  if (el.closest(".live-show")) return;
  const value = Number(el.value);
  const prev = lastRangeValues.get(el);
  lastRangeValues.set(el, value);
  if (prev === undefined || value === prev) return;
  if (sliderPlaying) return;
  playUiSound(value < prev ? "sliderLeft" : "slider");
}

function onRangePointerDown(event: Event): void {
  if (!isRangeInput(event.target)) return;
  snapshotRangeValue(event.target);
}

function onRangeKeyDown(event: Event): void {
  if (!isRangeInput(event.target)) return;
  snapshotRangeValue(event.target);
}

function onRangeInput(event: Event): void {
  if (!isRangeInput(event.target)) return;
  playRangeSliderSound(event.target);
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
  document.addEventListener("click", onPanelBtnClick, true);
  document.addEventListener("mouseover", onButtonHover, true);
  // document.addEventListener("animationstart", onHoverBlink, true);
  // document.addEventListener("animationiteration", onHoverBlink, true);
  document.addEventListener("pointerdown", onRangePointerDown, true);
  document.addEventListener("keydown", onRangeKeyDown, true);
  document.addEventListener("input", onRangeInput, true);
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
