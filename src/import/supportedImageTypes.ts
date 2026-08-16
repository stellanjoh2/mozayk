const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
]);

const SUPPORTED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "avif",
  "bmp",
]);

const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  svg: "SVG",
  heic: "HEIC",
  heif: "HEIF",
  tif: "TIFF",
  tiff: "TIFF",
  psd: "PSD",
  mp4: "MP4",
  mov: "MOV",
  m4v: "M4V",
  webm: "WebM",
  mkv: "MKV",
  avi: "AVI",
  cr2: "RAW",
  nef: "RAW",
  arw: "RAW",
  dng: "RAW",
  orf: "RAW",
  rw2: "RAW",
};

export const SUPPORTED_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp";

export class UnsupportedImageTypeError extends Error {
  readonly label: string;

  constructor(label: string) {
    super(`Unsupported image type: ${label}`);
    this.name = "UnsupportedImageTypeError";
    this.label = label;
  }
}

function fileExtension(file: File): string | undefined {
  const parts = file.name.split(".");
  if (parts.length < 2) return undefined;
  return parts[parts.length - 1]?.toLowerCase();
}

function mimeTypeLabel(mime: string): string {
  const subtype = mime.split("/")[1]?.split("+")[0]?.toUpperCase();
  return subtype || "This file type";
}

export function unsupportedImageMessage(label: string): string {
  if (label === "HEIC" || label === "HEIF") {
    return `${label} isn't supported in this browser. Convert the photo to JPEG or PNG and try again.`;
  }
  if (label === "SVG") {
    return "SVG vector files aren't supported. Use a photo format like JPEG, PNG, or WebP.";
  }
  if (label === "TIFF" || label === "PSD" || label === "RAW") {
    return `${label} files aren't supported. Use JPEG, PNG, WebP, GIF, or AVIF instead.`;
  }
  if (
    label === "MP4" ||
    label === "MOV" ||
    label === "M4V" ||
    label === "WebM" ||
    label === "MKV" ||
    label === "AVI"
  ) {
    return `${label} clips use Upload Video. This button is for still images.`;
  }
  return `${label} isn't supported. Use JPEG, PNG, WebP, GIF, or AVIF instead.`;
}

export function validateImageFile(file: File): void {
  const extension = fileExtension(file);

  if (extension && extension in UNSUPPORTED_EXTENSIONS) {
    throw new UnsupportedImageTypeError(UNSUPPORTED_EXTENSIONS[extension]);
  }

  if (file.type === "image/svg+xml") {
    throw new UnsupportedImageTypeError("SVG");
  }

  if (file.type === "image/heic" || file.type === "image/heif") {
    throw new UnsupportedImageTypeError("HEIC");
  }

  if (file.type === "image/tiff") {
    throw new UnsupportedImageTypeError("TIFF");
  }

  if (file.type === "video/quicktime") {
    throw new UnsupportedImageTypeError("MOV");
  }

  if (file.type.startsWith("video/")) {
    throw new UnsupportedImageTypeError(mimeTypeLabel(file.type));
  }

  if (file.type.startsWith("image/") && !SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new UnsupportedImageTypeError(mimeTypeLabel(file.type));
  }

  if (!file.type && extension && !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new UnsupportedImageTypeError(extension.toUpperCase());
  }
}
