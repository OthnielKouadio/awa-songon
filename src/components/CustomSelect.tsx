"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export type SelectOption = { value: string; label: string };
export type SelectGroup = { label: string; options: SelectOption[] };

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Liste plate d'options. */
  options?: SelectOption[];
  /** Ou options groupées (ex : sources groupées par cité). */
  groups?: SelectGroup[];
};

/** Menu déroulant custom (jamais de <select> natif) : déclenché et choisi
 *  uniquement via des <button onClick>, donc fiable sur mobile. Fond blanc,
 *  bordure 2px encre, forme pilule ; panneau déroulant bg-mist. */
export function CustomSelect({ value, onChange, placeholder = "— Choisir —", disabled, ariaLabel, options, groups }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const flat = groups ? groups.flatMap((g) => g.options) : options ?? [];
  const selected = flat.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`field flex w-full items-center justify-between gap-2 !rounded-full text-left ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } ${!selected ? "text-ink/35" : ""}`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} className="shrink-0 text-ink/50">
          <Icon name="arrow" size={16} className="rotate-90" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border-brut border-ink bg-mist p-1.5 shadow-hard-sm"
          >
            {flat.length === 0 && <p className="px-3 py-2 text-sm font-medium text-ink/50">Aucune option.</p>}

            {groups
              ? groups.map((g) => (
                  <div key={g.label} className="mb-1 last:mb-0">
                    <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-widest text-ink/45">{g.label}</p>
                    {g.options.map((o) => (
                      <Option key={o.value} option={o} selected={o.value === value} onChoose={choose} />
                    ))}
                  </div>
                ))
              : (options ?? []).map((o) => <Option key={o.value} option={o} selected={o.value === value} onChoose={choose} />)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Option({ option, selected, onChoose }: { option: SelectOption; selected: boolean; onChoose: (v: string) => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onChoose(option.value)}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left font-semibold transition-colors ${
        selected ? "bg-ink text-white" : "text-ink hover:bg-white"
      }`}
    >
      <span className="truncate">{option.label}</span>
      {selected && <Icon name="check" size={16} />}
    </button>
  );
}
