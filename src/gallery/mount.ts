import { RingGallery } from "./RingGallery";
import type { GalleryOptions } from "./types";

export type MountedGallery = {
  gallery: RingGallery;
  destroy: () => void;
};

export function mountGallery(
  target: string | HTMLElement,
  options: GalleryOptions = {},
): MountedGallery {
  const el =
    typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (!el) throw new Error("[ring-gallery] mount target not found");
  el.style.position = el.style.position || "relative";
  el.style.overflow = "hidden";
  const gallery = new RingGallery(el, options);
  return {
    gallery,
    destroy: () => gallery.destroy(),
  };
}
