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

export function imageToDataUrl(image: HTMLImageElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}
