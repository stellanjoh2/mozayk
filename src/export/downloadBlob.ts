export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function mosaicFrameFileName(
  index: number,
  ext: string,
  suffix = "",
): string {
  return `mozayk-frame${String(index).padStart(3, "0")}${suffix}.${ext}`;
}
