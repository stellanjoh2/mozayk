import encode, { init } from "gifski-wasm";
// gifski-wasm's package exports hide the .wasm file from import maps.
import wasmUrl from "../../node_modules/gifski-wasm/pkg/gifski_wasm_bg.wasm?url";

type EncodeRequest = {
  frames: ArrayBuffer[];
  width: number;
  height: number;
  delay: number;
  quality: number;
};

const ready = init(wasmUrl);

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  try {
    await ready;
    const { frames, width, height, delay, quality } = event.data;
    const images = frames.map((buffer) => new Uint8Array(buffer));
    const bytes = await encode({
      frames: images,
      width,
      height,
      resizeWidth: width,
      resizeHeight: height,
      frameDurations: images.map(() => delay),
      quality,
    });
    const out = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    self.postMessage({ ok: true, bytes: out }, { transfer: [out] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GIF encode failed";
    self.postMessage({ ok: false, message });
  }
};
