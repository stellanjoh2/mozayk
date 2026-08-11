export type ImageRgb = { r: number; g: number; b: number };

export type ImageSourceData = {
  dataUrl: string;
  palette: string[];
  paletteRgb: ImageRgb[];
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

export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const { sx, sy, sw, sh } = coverCropRect(
    image.width,
    image.height,
    width,
    height,
  );
  ctx.clearRect(0, 0, width, height);
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

export function imageToDataUrl(image: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}
