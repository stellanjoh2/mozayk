import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getPreviewSize } from "../config";
import { ensureCachedSourceImage } from "../import/imageSource";
import { renderMosaic } from "../render/renderFrame";
import { duplicateFrame } from "../state/frameUtils";
import type { Frame, Orientation } from "../types";
import { PlayIcon, StopIcon } from "../ui/icons";
import { playUiSound, triggerShortcutButton } from "../ui/sounds";
import { pickLiveAction, type LiveAction, type LiveSensitivity } from "./analyse";
import { createLiveAudioEngine, micErrorMessage } from "./audioEngine";
import { applyLiveAction, createLiveFrame, LIVE_ORIENTATION } from "./liveFrame";
import "./LiveShow.css";

const AUDIO_ACCEPT = "audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.flac";

const HIT_LABEL: Record<LiveAction, string> = {
  shapes: "shapes",
  colours: "colours",
  invert: "invert",
  all: "all",
};

function useLoadedImage(dataUrl: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!dataUrl) {
      setImage(null);
      return;
    }
    let cancelled = false;
    void ensureCachedSourceImage(dataUrl)
      .then((loaded) => {
        if (!cancelled) setImage(loaded);
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);
  return image;
}

type LiveShowProps = {
  frame?: Frame;
  orientation?: Orientation;
  onClose?: () => void;
};

export function LiveShow({
  frame: sourceFrame,
  orientation = LIVE_ORIENTATION,
  onClose,
}: LiveShowProps) {
  const [frame, setFrame] = useState(() =>
    sourceFrame ? duplicateFrame(sourceFrame) : createLiveFrame(),
  );
  const [source, setSource] = useState<"mic" | "file" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePaused, setFilePaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const [hit, setHit] = useState<LiveAction | null>(null);
  const [volumeSense, setVolumeSense] = useState(50);
  const [freqSense, setFreqSense] = useState(50);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const volMeterRef = useRef<HTMLSpanElement>(null);
  const freqMeterRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef(frame);
  const orientationRef = useRef(orientation);
  const senseRef = useRef<LiveSensitivity>({ volume: 50, freq: 50 });
  const uiHiddenRef = useRef(false);
  const engineRef = useRef<ReturnType<typeof createLiveAudioEngine> | null>(null);

  frameRef.current = frame;
  orientationRef.current = orientation;
  senseRef.current = { volume: volumeSense, freq: freqSense };
  uiHiddenRef.current = uiHidden;

  const sourceImage = useLoadedImage(
    frame.settings.showSourceImage ? frame.imageSource?.dataUrl : undefined,
  );
  const backgroundImage = useLoadedImage(frame.backgroundImage?.dataUrl);
  const textureOverlayImage = useLoadedImage(frame.textureOverlay?.dataUrl);

  const [canvasW, canvasH] = getPreviewSize(orientation);

  useEffect(() => {
    const engine = createLiveAudioEngine();
    engineRef.current = engine;
    const unsubscribe = engine.subscribe((sample) => {
      const volEl = volMeterRef.current;
      const freqEl = freqMeterRef.current;
      if (volEl) volEl.style.transform = `scaleX(${Math.min(1, sample.volume * 3)})`;
      if (freqEl) freqEl.style.transform = `scaleX(${sample.freq})`;

      const action = pickLiveAction(sample, senseRef.current, sample.onset);
      if (!action) return;
      const next = applyLiveAction(
        frameRef.current,
        action,
        orientationRef.current,
      );
      frameRef.current = next;
      setFrame(next);
      setHit(action);
    });
    return () => {
      unsubscribe();
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hit) return;
    const id = window.setTimeout(() => setHit(null), 280);
    return () => window.clearTimeout(id);
  }, [hit]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      renderMosaic(canvas, {
        orientation,
        settings: frame.settings,
        blocks: frame.blocks,
        width: canvasW,
        height: canvasH,
        sourceImage,
        backgroundImage,
        textureOverlayImage,
        skipGridBlur: true,
      });
    } catch (err) {
      console.error(err);
    }
  }, [
    frame,
    orientation,
    canvasW,
    canvasH,
    sourceImage,
    backgroundImage,
    textureOverlayImage,
  ]);

  const startMic = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || busy) return;
    setBusy(true);
    setError(null);
    try {
      await engine.startMic();
      setSource("mic");
      setFileName(null);
      setFilePaused(false);
    } catch (err) {
      setError(micErrorMessage(err));
      setSource(null);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const onPickFile = useCallback(
    async (file: File | undefined) => {
      const engine = engineRef.current;
      if (!engine || !file || busy) return;
      setBusy(true);
      setError(null);
      try {
        await engine.loadFile(file);
        setSource("file");
        setFileName(file.name);
        setFilePaused(engine.isFilePaused());
        playUiSound("ok");
      } catch {
        setError("Could not play that audio file.");
        setSource(null);
        setFileName(null);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const toggleFilePaused = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || source !== "file") return;
    const next = !engine.isFilePaused();
    engine.setFilePaused(next);
    setFilePaused(next);
    playUiSound(next ? "close" : "ok");
  }, [source]);

  const close = useCallback(() => {
    playUiSound("close");
    onClose?.();
  }, [onClose]);

  const fireManual = useCallback((action: LiveAction) => {
    const current = frameRef.current;
    const next =
      action === "invert"
        ? {
            ...current,
            settings: {
              ...current.settings,
              invert: !current.settings.invert,
            },
          }
        : applyLiveAction(current, action, orientationRef.current);
    frameRef.current = next;
    setFrame(next);
    setHit(action);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        close();
        return;
      }
      if (event.repeat) return;
      if (event.code === "KeyH") {
        event.preventDefault();
        triggerShortcutButton("KeyH");
        const next = !uiHiddenRef.current;
        setUiHidden(next);
        playUiSound(next ? "close" : "push");
      } else if (event.code === "KeyQ") {
        event.preventDefault();
        triggerShortcutButton("KeyQ");
        fireManual("shapes");
      } else if (event.code === "KeyW") {
        event.preventDefault();
        triggerShortcutButton("KeyW");
        fireManual("all");
      } else if (event.code === "KeyE") {
        event.preventDefault();
        triggerShortcutButton("KeyE");
        fireManual("colours");
      } else if (event.code === "KeyI") {
        event.preventDefault();
        triggerShortcutButton("KeyI");
        fireManual("invert");
      } else if (event.code === "KeyL") {
        event.preventDefault();
        triggerShortcutButton("KeyL");
        void startMic();
      } else if (event.code === "Space" && source === "file") {
        event.preventDefault();
        triggerShortcutButton("Space");
        toggleFilePaused();
      } else if (event.code === "KeyM") {
        event.preventDefault();
        triggerShortcutButton("KeyM");
        void startMic();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [source, startMic, toggleFilePaused, onClose, close, fireManual]);

  return (
    <div className={`live-show${uiHidden ? " is-ui-hidden" : ""}`}>
      <canvas
        ref={canvasRef}
        className="live-show__canvas"
        width={canvasW}
        height={canvasH}
        aria-label="Live mosaic"
      />
      <nav
        className="live-show__dock"
        aria-label="Live show controls"
        aria-hidden={uiHidden}
        inert={uiHidden}
      >
        <div className="live-show__dock-group">
          <button
            type="button"
            className={source === "mic" ? "is-on" : undefined}
            aria-pressed={source === "mic"}
            aria-keyshortcuts="l"
            disabled={busy}
            title="Force the browser to capture the microphone"
            onClick={() => void startMic()}
          >
            Listen
          </button>
          <button
            type="button"
            className={source === "mic" ? "is-on" : undefined}
            aria-pressed={source === "mic"}
            aria-keyshortcuts="m"
            disabled={busy}
            onClick={() => void startMic()}
          >
            Mic
          </button>
          <button
            type="button"
            className={source === "file" ? "is-on" : undefined}
            aria-pressed={source === "file"}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Track
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            className="live-show__file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void onPickFile(file);
            }}
          />
          {source === "file" ? (
            <button
              type="button"
              className="live-show__icon-btn"
              aria-label={filePaused ? "Play" : "Pause"}
              aria-keyshortcuts="Space"
              onClick={toggleFilePaused}
            >
              {filePaused ? <PlayIcon /> : <StopIcon />}
            </button>
          ) : null}
        </div>
        <div className="live-show__dock-divider" aria-hidden="true" />
        <div className="live-show__dock-group">
          <button
            type="button"
            aria-keyshortcuts="q"
            data-shortcut="KeyQ"
            onClick={() => fireManual("shapes")}
          >
            Layout
          </button>
          <button
            type="button"
            aria-keyshortcuts="w"
            data-shortcut="KeyW"
            onClick={() => fireManual("all")}
          >
            All
          </button>
          <button
            type="button"
            aria-keyshortcuts="e"
            data-shortcut="KeyE"
            onClick={() => fireManual("colours")}
          >
            Colours
          </button>
          <button
            type="button"
            className={frame.settings.invert ? "is-on" : undefined}
            aria-pressed={Boolean(frame.settings.invert)}
            aria-keyshortcuts="i"
            data-shortcut="KeyI"
            onClick={() => fireManual("invert")}
          >
            Invert
          </button>
        </div>
        <div className="live-show__dock-divider" aria-hidden="true" />
        <label className="live-show__slider">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volumeSense}
            title="Volume sensitivity"
            onChange={(event) => setVolumeSense(Number(event.target.value))}
          />
          <span className="live-show__value">{volumeSense}</span>
        </label>
        <label className="live-show__slider">
          <span>Frequency</span>
          <input
            type="range"
            min={0}
            max={100}
            value={freqSense}
            title="Frequency sensitivity"
            onChange={(event) => setFreqSense(Number(event.target.value))}
          />
          <span className="live-show__value">{freqSense}</span>
        </label>
        <div className="live-show__meters" aria-hidden="true">
          <span className="live-show__meter">
            <span ref={volMeterRef} className="live-show__meter-fill" />
          </span>
          <span className="live-show__meter">
            <span ref={freqMeterRef} className="live-show__meter-fill" />
          </span>
        </div>
        <p className={`live-show__hit${hit ? " is-on" : ""}`}>
          {hit ? HIT_LABEL[hit] : fileName ?? "live"}
        </p>
        {error ? <p className="live-show__error">{error}</p> : null}
        {onClose ? (
          <button type="button" onClick={close}>
            Exit
          </button>
        ) : (
          <a className="live-show__back" href={import.meta.env.BASE_URL}>
            Mozayk
          </a>
        )}
      </nav>
    </div>
  );
}
