import type { MediaKind } from "../types";

export type Slot = {
  id: string;
  url: string;
  kind: MediaKind;
  name: string;
};

type SlotStripProps = {
  slots: Slot[];
  selectedIndex: number;
  activeRing: number;
  ringCount: number;
  onSelect: (index: number) => void;
};

export function SlotStrip({
  slots,
  selectedIndex,
  activeRing,
  ringCount,
  onSelect,
}: SlotStripProps) {
  const ringLabel = ringCount > 1 ? `Ring ${activeRing + 1} · ` : "";
  return (
    <div className="slot-strip">
      <div className="slot-strip__label">
        {slots.length === 0
          ? `${ringLabel}No frames`
          : selectedIndex >= 0
            ? `${ringLabel}Frame ${selectedIndex + 1} / ${slots.length}`
            : `${ringLabel}${slots.length} frames`}
      </div>
      <div className="slot-strip__row">
        {slots.map((slot, index) => (
          <button
            key={slot.id}
            type="button"
            className={
              index === selectedIndex
                ? "slot-thumb is-active"
                : "slot-thumb"
            }
            onClick={() => onSelect(index)}
            title={slot.name}
          >
            {slot.kind === "video" ? (
              <video src={slot.url} muted playsInline />
            ) : (
              <img src={slot.url} alt="" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
