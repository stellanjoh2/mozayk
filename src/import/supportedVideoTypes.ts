const SUPPORTED_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
]);

const SUPPORTED_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);

const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  webm: "WebM",
  mkv: "MKV",
  avi: "AVI",
  mpg: "MPEG",
  mpeg: "MPEG",
  wmv: "WMV",
  flv: "FLV",
  gif: "GIF",
};

export const SUPPORTED_VIDEO_ACCEPT =
  "video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v";

export class UnsupportedVideoTypeError extends Error {
  readonly label: string;

  constructor(label: string) {
    super(`Unsupported video type: ${label}`);
    this.name = "UnsupportedVideoTypeError";
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

export function unsupportedVideoMessage(label: string): string {
  if (label === "WebM" || label === "MKV" || label === "AVI" || label === "MPEG") {
    return `${label} isn't supported. Convert the clip to MP4 or MOV and try again.`;
  }
  if (label === "GIF") {
    return "Animated GIFs use Upload Image. Video import is for MP4 and MOV clips.";
  }
  return `${label} isn't supported. Use an MP4 or MOV clip (up to 5 seconds).`;
}

export function validateVideoFile(file: File): void {
  const extension = fileExtension(file);

  if (extension && extension in UNSUPPORTED_EXTENSIONS) {
    throw new UnsupportedVideoTypeError(UNSUPPORTED_EXTENSIONS[extension]);
  }

  if (file.type.startsWith("video/") && !SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new UnsupportedVideoTypeError(mimeTypeLabel(file.type));
  }

  if (!file.type && extension && !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new UnsupportedVideoTypeError(extension.toUpperCase());
  }

  if (file.type.startsWith("image/")) {
    throw new UnsupportedVideoTypeError(mimeTypeLabel(file.type));
  }
}
