export type ImageRgb = { r: number; g: number; b: number };

/** Cover fills the canvas (may crop). Contain letterboxes so nothing is cropped. */
export type ImageFitMode = "cover" | "contain";

export type ImageSourceData = {
  dataUrl: string;
  palette: string[];
  paletteRgb: ImageRgb[];
  /** Transparent cutouts use contain so subject pixels never leave the canvas. */
  fit?: ImageFitMode;
};

const imageCache = new Map<string, HTMLImageElement>();

export function cacheSourceImage(dataUrl: string, image: HTMLImageElement): void {
  imageCache.set(dataUrl, image);
}

export function getCachedSourceImage(
  dataUrl: string,
): HTMLImageElement | undefined {
  return imageCache.get(dataUrl);
}

export function coverCropRect(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const targetAspect = targetWidth / targetHeight;
  const imageAspect = imageWidth / imageHeight;
  let sx = 0;
  let sy = 0;
  let sw = imageWidth;
  let sh = imageHeight;

  if (imageAspect > targetAspect) {
    sw = imageHeight * targetAspect;
    sx = (imageWidth - sw) / 2;
  } else {
    sh = imageWidth / targetAspect;
    sy = (imageHeight - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

/** Destination rect that fits the full image inside the target (letterbox). */
export function containDestRect(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
): { dx: number; dy: number; dw: number; dh: number } {
  const targetAspect = targetWidth / targetHeight;
  const imageAspect = imageWidth / Math.max(1, imageHeight);
  if (imageAspect > targetAspect) {
    const dw = targetWidth;
    const dh = targetWidth / imageAspect;
    return { dx: 0, dy: (targetHeight - dh) / 2, dw, dh };
  }
  const dh = targetHeight;
  const dw = targetHeight * imageAspect;
  return { dx: (targetWidth - dw) / 2, dy: 0, dw, dh };
}

/** True when the image has meaningful alpha (cutout / soft edges). */
export function imageHasTransparency(image: HTMLImageElement): boolean {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  if (srcW <= 0 || srcH <= 0) return false;

  const w = Math.min(64, srcW);
  const h = Math.min(64, srcH);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  drawFittedImage(ctx, image, width, height, "cover");
}

export function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  fit: ImageFitMode = "cover",
): void {
  ctx.clearRect(0, 0, width, height);
  if (fit === "contain") {
    const { dx, dy, dw, dh } = containDestRect(
      image.width,
      image.height,
      width,
      height,
    );
    ctx.drawImage(image, 0, 0, image.width, image.height, dx, dy, dw, dh);
    return;
  }
  const { sx, sy, sw, sh } = coverCropRect(
    image.width,
    image.height,
    width,
    height,
  );
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

export function ensureCachedSourceImage(
  dataUrl: string,
): Promise<HTMLImageElement> {
  const cached = imageCache.get(dataUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      cacheSourceImage(dataUrl, image);
      resolve(image);
    };
    image.onerror = () => reject(new Error("Could not load source image"));
    image.src = dataUrl;
  });
}

/** Read a local image file as a data URL (keeps original format / alpha). */
export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

export function imageToDataUrl(
  image: HTMLImageElement,
  format: "jpeg" | "png" = "jpeg",
): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(image, 0, 0);
  if (format === "png") return canvas.toDataURL("image/png");
  return canvas.toDataURL("image/jpeg", 0.92);
}
