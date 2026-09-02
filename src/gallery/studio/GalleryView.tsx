import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { RingGallery } from "../RingGallery";
import type { GalleryItem, GallerySettings } from "../types";

export type GalleryViewHandle = {
  getGallery: () => RingGallery | null;
};

type GalleryViewProps = {
  rings: GalleryItem[][];
  settings: GallerySettings;
  selectedIndex: number;
  activeRing: number;
  preview: boolean;
  onSelect: (index: number, ring?: number) => void;
  ref?: Ref<GalleryViewHandle>;
};

export function GalleryView({
  rings,
  settings,
  selectedIndex,
  activeRing,
  preview,
  onSelect,
  ref,
}: GalleryViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<RingGallery | null>(null);
  const onSelectRef = useRef(onSelect);
  const [webglError, setWebglError] = useState(false);
  onSelectRef.current = onSelect;

  useImperativeHandle(ref, () => ({
    getGallery: () => galleryRef.current,
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let gallery: RingGallery;
    try {
      gallery = new RingGallery(host, {
        ...settings,
        rings,
        selectedIndex,
        selectedRing: activeRing,
        preview,
        onSelect: (index, ring) => onSelectRef.current(index, ring),
      });
    } catch {
      setWebglError(true);
      return;
    }
    galleryRef.current = gallery;
    return () => {
      const instance = gallery;
      // Defer so React Strict Mode can remount before this context is lost.
      // Destroying in the cleanup itself makes Chrome block the next WebGL context.
      window.setTimeout(() => {
        instance.destroy();
        if (galleryRef.current === instance) galleryRef.current = null;
      }, 0);
    };
    // Mount once. Updates go through the instance API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    galleryRef.current?.setRings(rings);
  }, [rings]);

  useEffect(() => {
    galleryRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    galleryRef.current?.setActiveRing(activeRing);
  }, [activeRing]);

  useEffect(() => {
    galleryRef.current?.setSelectedIndex(selectedIndex, activeRing);
  }, [selectedIndex, activeRing]);

  useEffect(() => {
    galleryRef.current?.setPreview(preview);
  }, [preview]);

  return (
    <div ref={hostRef} className="gallery-host">
      {webglError ? (
        <p className="empty-hint">WebGL was blocked. Reload this tab.</p>
      ) : null}
    </div>
  );
}
