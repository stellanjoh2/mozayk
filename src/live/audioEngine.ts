import {
  detectOnset,
  highBandRatio,
  ONSET_COOLDOWN_MS,
  ONSET_FLOOR,
  timeDomainRms,
  updateMusicEnv,
  updateNoiseFloor,
  type LiveMeters,
} from "./analyse";

export type LiveAudioSource = "mic" | "file";

export type LiveAudioSample = LiveMeters & { onset: boolean };

type LiveAudioListener = (sample: LiveAudioSample) => void;

type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };

const FFT_SIZE = 2048;

export function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Microphone permission denied.";
  if (name === "NotFoundError") return "No microphone found.";
  if (name === "NotReadableError") {
    return "Microphone is busy — iPhone Continuity often holds it. Pick another input in System Settings → Sound.";
  }
  if (name === "OverconstrainedError") {
    return "That microphone can't be used for live capture. Try another input.";
  }
  if (name === "SecurityError") return "Microphone needs HTTPS or localhost.";
  return "Could not start the microphone.";
}

async function getMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone is not available in this browser.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name !== "NotReadableError" && name !== "OverconstrainedError") throw err;
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const device of devices) {
      if (device.kind !== "audioinput") continue;
      if (!device.deviceId || device.deviceId === "default") continue;
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: device.deviceId } },
        });
      } catch {
        continue;
      }
    }
    throw err;
  }
}

export type LiveAudioEngine = {
  startMic: () => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  stop: () => void;
  subscribe: (listener: LiveAudioListener) => () => void;
  getFileName: () => string | null;
  getSource: () => LiveAudioSource | null;
  setFilePaused: (paused: boolean) => void;
  isFilePaused: () => boolean;
};

export function createLiveAudioEngine(): LiveAudioEngine {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let inputGain: GainNode | null = null;
  let outputGain: GainNode | null = null;
  let micStream: MediaStream | null = null;
  let micNode: MediaStreamAudioSourceNode | null = null;
  let fileEl: HTMLAudioElement | null = null;
  let fileNode: MediaElementAudioSourceNode | null = null;
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let source: LiveAudioSource | null = null;
  let raf = 0;
  let freqBuf: Uint8Array<ArrayBuffer> | null = null;
  let timeBuf: Uint8Array<ArrayBuffer> | null = null;
  let prevRms = 0;
  let lastOnsetMs = 0;
  let musicEnv = 0;
  let noiseFloor = 0;
  const listeners = new Set<LiveAudioListener>();

  async function ensureGraph(waitForResume = true): Promise<AudioContext> {
    const AC = window.AudioContext ??
      (window as WindowWithWebkit).webkitAudioContext;
    if (!AC) throw new Error("Web Audio is not available in this browser.");
    if (!ctx || ctx.state === "closed") {
      ctx = new AC();
      analyser = null;
      inputGain = null;
      outputGain = null;
      micNode = null;
      fileNode = null;
      fileEl = null;
    }
    if (ctx.state === "suspended") {
      const resume = ctx.resume();
      if (waitForResume) await resume;
    }
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.28;
      freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      timeBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }
    if (!inputGain) inputGain = ctx.createGain();
    if (!outputGain) {
      outputGain = ctx.createGain();
      outputGain.connect(ctx.destination);
    }
    return ctx;
  }

  function disconnectInputs(): void {
    micNode?.disconnect();
    micNode = null;
    fileNode?.disconnect();
    try {
      inputGain?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      analyser?.disconnect();
    } catch {
      /* already disconnected */
    }
    if (micStream) {
      for (const track of micStream.getTracks()) track.stop();
      micStream = null;
    }
  }

  function hookupAnalyser(mode: LiveAudioSource): void {
    if (!analyser || !inputGain || !outputGain) return;
    inputGain.gain.value = mode === "mic" ? 3 : 1;
    // Mic must reach destination or Chrome never runs the graph — keep it silent.
    outputGain.gain.value = mode === "mic" ? 0 : 1;
    inputGain.connect(analyser);
    analyser.connect(outputGain);
  }

  function stopLoop(): void {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function emit(sample: LiveAudioSample): void {
    for (const listener of listeners) listener(sample);
  }

  function tick(now: number): void {
    raf = requestAnimationFrame(tick);
    if (!analyser || !freqBuf || !timeBuf || !ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    analyser.getByteFrequencyData(freqBuf);
    analyser.getByteTimeDomainData(timeBuf);
    const volume = timeDomainRms(timeBuf);
    const freq = highBandRatio(freqBuf, ctx.sampleRate);
    noiseFloor = updateNoiseFloor(volume, noiseFloor);
    musicEnv = updateMusicEnv(volume, musicEnv);
    const onset = detectOnset(
      volume,
      prevRms,
      now,
      lastOnsetMs,
      ONSET_COOLDOWN_MS,
      ONSET_FLOOR,
      musicEnv,
      noiseFloor,
    );
    if (onset) lastOnsetMs = now;
    prevRms = volume;
    emit({ volume, freq, onset });
  }

  function startLoop(): void {
    if (raf) return;
    prevRms = 0;
    lastOnsetMs = 0;
    musicEnv = 0;
    noiseFloor = 0;
    raf = requestAnimationFrame(tick);
  }

  async function startMic(): Promise<void> {
    disconnectInputs();
    if (fileEl) {
      fileEl.pause();
      fileEl.currentTime = 0;
    }
    // Unlock Web Audio in the same tap as getUserMedia — iOS drops the
    // gesture if we await resume() first. iPhone Continuity mics also
    // reject echoCancellation: false, so request a plain audio track.
    await ensureGraph(false);
    const stream = await getMicrophoneStream();
    const audioCtx = await ensureGraph(true);
    if (!analyser || !inputGain) throw new Error("Analyser missing");
    for (const track of stream.getAudioTracks()) track.enabled = true;
    micStream = stream;
    micNode = audioCtx.createMediaStreamSource(stream);
    micNode.connect(inputGain);
    hookupAnalyser("mic");
    source = "mic";
    startLoop();
  }

  async function loadFile(file: File): Promise<void> {
    const audioCtx = await ensureGraph();
    if (!analyser) throw new Error("Analyser missing");
    disconnectInputs();

    if (fileUrl) URL.revokeObjectURL(fileUrl);
    fileUrl = URL.createObjectURL(file);
    fileName = file.name;

    if (!fileEl) {
      fileEl = new Audio();
      fileEl.loop = true;
      fileEl.crossOrigin = "anonymous";
      fileEl.preload = "auto";
    }
    if (!fileNode) {
      fileNode = audioCtx.createMediaElementSource(fileEl);
    }
    fileEl.src = fileUrl;
    fileNode.connect(inputGain!);
    hookupAnalyser("file");
    try {
      await fileEl.play();
    } catch {
      /* autoplay blocked until another gesture — play control handles it */
    }
    source = "file";
    startLoop();
  }

  function stop(): void {
    stopLoop();
    disconnectInputs();
    fileNode = null;
    if (fileEl) {
      fileEl.pause();
      fileEl.removeAttribute("src");
      fileEl.load();
      fileEl = null;
    }
    if (fileUrl) {
      URL.revokeObjectURL(fileUrl);
      fileUrl = null;
    }
    fileName = null;
    source = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
    ctx = null;
    analyser = null;
    inputGain = null;
    outputGain = null;
    fileNode = null;
  }

  return {
    startMic,
    loadFile,
    stop,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getFileName: () => fileName,
    getSource: () => source,
    setFilePaused(paused) {
      if (!fileEl || source !== "file") return;
      if (paused) fileEl.pause();
      else void fileEl.play().catch(() => {});
    },
    isFilePaused: () => Boolean(fileEl && fileEl.paused),
  };
}
