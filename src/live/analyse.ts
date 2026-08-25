/** RMS of unsigned 8-bit PCM centred on 128. */
export function timeDomainRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = ((samples[i] ?? 128) - 128) / 128;
    sum += x * x;
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Share of spectrum energy at or above `lowHz` (0–1).
 * Empty or silent buffers return 0.
 */
export function highBandRatio(
  bins: ArrayLike<number>,
  sampleRate: number,
  lowHz = 2000,
): number {
  if (bins.length < 2 || sampleRate <= 0) return 0;
  const nyquist = sampleRate / 2;
  const cutoff = Math.min(nyquist, Math.max(0, lowHz));
  const binHz = nyquist / (bins.length - 1);
  const start = Math.min(bins.length - 1, Math.max(1, Math.round(cutoff / binHz)));

  let total = 0;
  let high = 0;
  for (let i = 0; i < bins.length; i++) {
    const mag = bins[i] ?? 0;
    total += mag;
    if (i >= start) high += mag;
  }
  if (total <= 0) return 0;
  return high / total;
}

export const ONSET_FLOOR = 0.07;
export const ONSET_COOLDOWN_MS = 220;
/** Per-frame decay for the recent music envelope (~60fps). */
export const MUSIC_ENV_DECAY = 0.96;

export function updateMusicEnv(rms: number, env: number, decay = MUSIC_ENV_DECAY): number {
  return Math.max(rms, env * decay);
}

/** Follow quiet levels so a silent room is not treated as music. */
export function updateNoiseFloor(rms: number, floor: number): number {
  if (!Number.isFinite(rms) || rms < 0) return floor;
  if (rms < floor) return Math.max(0.002, floor * 0.7 + rms * 0.3);
  if (rms < ONSET_FLOOR) return floor * 0.99 + rms * 0.01;
  return floor;
}

export function detectOnset(
  rms: number,
  prevRms: number,
  nowMs: number,
  lastOnsetMs: number,
  cooldownMs = ONSET_COOLDOWN_MS,
  floor = ONSET_FLOOR,
  musicEnv = rms,
  noiseFloor = 0,
): boolean {
  if (nowMs - lastOnsetMs < cooldownMs) return false;
  const gate = Math.max(floor, noiseFloor * 4);
  if (rms < gate) return false;
  if (rms < musicEnv * 0.4) return false;
  const flux = rms - prevRms;
  if (flux > 0.025 || rms > prevRms * 1.2) return true;
  return true;
}

export type LiveAction = "shapes" | "colours" | "invert" | "all";

export type LiveMeters = {
  volume: number;
  freq: number;
};

export type LiveSensitivity = {
  volume: number;
  freq: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function sense01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value / 100));
}

function colourVolumeThreshold(volSense: number): number {
  return 0.62 - 0.32 * volSense;
}

function invertVolumeThreshold(volSense: number): number {
  return 0.88 - 0.38 * volSense;
}

function colourFreqThreshold(freqSense: number): number {
  return 0.48 - 0.28 * freqSense;
}

function invertFreqThreshold(freqSense: number): number {
  return 0.72 - 0.32 * freqSense;
}

/**
 * One hit per onset. Regular energy rerolls shapes; louder or brighter
 * hits swap colours; peak loud + high (or extreme volume) inverts.
 */
export function pickLiveAction(
  meters: LiveMeters,
  sensitivity: LiveSensitivity,
  onset: boolean,
): LiveAction | null {
  if (!onset) return null;

  const raw = clamp01(meters.volume);
  const freq = clamp01(meters.freq);
  if (raw < ONSET_FLOOR) return null;

  const volSense = sense01(sensitivity.volume);
  const freqSense = sense01(sensitivity.freq);
  const volume = clamp01(raw * (0.65 + 1.15 * volSense));

  const invertVol = invertVolumeThreshold(volSense);
  const colourVol = colourVolumeThreshold(volSense);
  const invertFreq = invertFreqThreshold(freqSense);
  const colourFreq = colourFreqThreshold(freqSense);
  const extremeVol = Math.max(0.9, invertVol + 0.12);

  if ((volume >= invertVol && freq >= invertFreq) || volume >= extremeVol) {
    return "invert";
  }
  if (volume >= colourVol || freq >= colourFreq) return "colours";
  return "shapes";
}
