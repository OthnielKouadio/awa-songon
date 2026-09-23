"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

export type MultiSelectOption = { value: string; label: string };

type CustomMultiSelectProps = {
  values: string[];
  onChange: (values: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  ariaLabel?: string;
};

/** Comme CustomSelect, mais plusieurs choix possibles (ex : les cités qu'un
 *  chauffeur livre) : le panneau reste ouvert après chaque clic, chaque ligne
 *  a une coche. Jamais de <select multiple> natif. */
export function CustomMultiSelect({ values, onChange, options, placeholder = "— Choisir —", ariaLabel }: CustomMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }

  const selectedLabels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const summary = selectedLabels.length === 0 ? placeholder : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} cités choisies`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`field flex w-full items-center justify-between gap-2 !rounded-full text-left ${selectedLabels.length === 0 ? "text-ink/35" : ""}`}
      >
        <span className="truncate">{summary}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }} className="shrink-0 text-ink/50">
          <Icon name="arrow" size={16} className="rotate-90" />
        </motion.span>
      </button>

      {selectedLabels.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedLabels.map((l) => (
            <span key={l} className="rounded-full border-[1.5px] border-ink bg-white px-2.5 py-0.5 text-xs font-bold">
              {l}
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-multiselectable="true"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="absolute z-[1100] mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border-brut border-ink bg-mist p-1.5 shadow-hard-sm"
          >
            {options.length === 0 && <p className="px-3 py-2 text-sm font-medium text-ink/50">Aucune option.</p>}
            {options.map((o) => {
              const checked = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(o.value)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left font-semibold transition-colors ${
                    checked ? "bg-ink text-white" : "text-ink hover:bg-white"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 ${checked ? "border-white bg-white text-ink" : "border-ink/40"}`}
                  >
                    {checked && <Icon name="check" size={13} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
