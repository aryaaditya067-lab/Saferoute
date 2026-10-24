"use client";

import { ChevronDown, Layers } from "lucide-react";
import { useState, type ReactNode } from "react";

/** Map layers card: always open on wide screens; on phones it folds into a small button so the map stays clear. */
export function MapLayers({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Map layers" className="pointer-events-auto flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="sr-glass inline-flex h-10 items-center gap-2 rounded-full pr-3 pl-3.5 text-[14px] font-semibold text-ink shadow-control md:hidden"
      >
        <Layers className="size-4 text-ink-soft" aria-hidden="true" />
        Layers
        {activeCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`size-4 text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div className={`${open ? "mt-2 flex animate-slide-down" : "hidden"} sr-glass w-full flex-col rounded-[18px] p-1.5 shadow-float md:mt-0 md:flex md:animate-none`}>
        <h2 className="px-2.5 pt-1.5 pb-1 text-[12px] font-semibold text-ink-muted">Map layers</h2>
        {children}
      </div>
    </section>
  );
}
