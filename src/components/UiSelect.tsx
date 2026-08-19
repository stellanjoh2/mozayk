import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { playUiSound } from "../ui/sounds";

export type UiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type UiSelectProps = {
  value: string | number;
  options: readonly UiSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  title?: string;
};

function enabledIndexes(options: readonly UiSelectOption[]): number[] {
  return options.flatMap((opt, i) => (opt.disabled ? [] : [i]));
}

export function UiSelect({
  value,
  options,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  title,
}: UiSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [open, setOpen] = useState(false);
  const valueKey = String(value);
  const selectedIndex = options.findIndex((opt) => opt.value === valueKey);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  );

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const pick = (next: string) => {
    if (next !== valueKey) onChangeRef.current(next);
    close();
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const place = () => {
      const t = trigger.getBoundingClientRect();
      const zoom = t.height / Math.max(1, trigger.offsetHeight);
      menu.style.minWidth = `${t.width / zoom}px`;
      const m = menu.getBoundingClientRect();
      const gap = 8;
      let left = t.left;
      if (left + m.width > window.innerWidth - gap) {
        left = window.innerWidth - gap - m.width;
      }
      left = Math.max(gap, left);
      let top = t.bottom + 2;
      if (top + m.height > window.innerHeight - gap) {
        top = t.top - m.height - 2;
      }
      top = Math.max(gap, Math.min(top, window.innerHeight - gap - m.height));
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;
    };

    place();

    const scrollers: EventTarget[] = [window];
    let node: HTMLElement | null = trigger;
    while (node) {
      const style = getComputedStyle(node);
      if (
        /(auto|scroll|overlay)/.test(style.overflowY) ||
        /(auto|scroll|overlay)/.test(style.overflowX)
      ) {
        scrollers.push(node);
      }
      node = node.parentElement;
    }
    for (const target of scrollers) {
      target.addEventListener("scroll", place, { passive: true });
    }
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      for (const target of scrollers) {
        target.removeEventListener("scroll", place);
      }
    };
  }, [open, options]);

  useLayoutEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const enabled = enabledIndexes(options);
      if (enabled.length === 0) return;
      const current = enabled.includes(activeIndex)
        ? activeIndex
        : (enabled[0] ?? 0);
      const pos = Math.max(0, enabled.indexOf(current));

      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(enabled[Math.min(pos + 1, enabled.length - 1)] ?? current);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(enabled[Math.max(pos - 1, 0)] ?? current);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(enabled[0] ?? current);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(enabled[enabled.length - 1] ?? current);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const opt = options[current];
        if (opt && !opt.disabled) pickRef.current(opt.value);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;
      const label = rootRef.current?.closest("label");
      if (label?.contains(target)) return;
      setOpen(false);
    };
    const bindId = requestAnimationFrame(() => {
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("pointerdown", onPointerDown, true);
    });
    return () => {
      cancelAnimationFrame(bindId);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, options, activeIndex]);

  return (
    <div
      ref={rootRef}
      className={["ui-select", className].filter(Boolean).join(" ")}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ui-select__trigger"
        disabled={disabled}
        role="combobox"
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && options[activeIndex]
            ? `${listId}-opt-${activeIndex}`
            : undefined
        }
        onClick={() => {
          if (disabled) return;
          playUiSound("push");
          setOpen((next) => !next);
        }}
        onKeyDown={(event) => {
          if (disabled || open) return;
          if (
            event.key === "ArrowDown" ||
            event.key === "ArrowUp" ||
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();
            playUiSound("push");
            setOpen(true);
          }
        }}
      >
        {selected?.label ?? valueKey}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              className={["ui-select__menu", className].filter(Boolean).join(" ")}
              role="listbox"
              aria-label={ariaLabel}
            >
              {options.map((opt, index) => (
                <div
                  key={opt.value}
                  id={`${listId}-opt-${index}`}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  role="option"
                  aria-selected={opt.value === valueKey}
                  aria-disabled={opt.disabled || undefined}
                  className={[
                    "ui-select__option",
                    opt.value === valueKey ? " is-selected" : "",
                    index === activeIndex ? " is-active" : "",
                    opt.disabled ? " is-disabled" : "",
                  ].join("")}
                  onMouseEnter={() => {
                    if (!opt.disabled) setActiveIndex(index);
                  }}
                  onClick={() => {
                    if (!opt.disabled) pick(opt.value);
                  }}
                >
                  {opt.label}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
