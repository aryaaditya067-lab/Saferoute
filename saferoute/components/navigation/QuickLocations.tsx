"use client";

import { Briefcase, GraduationCap, House, Settings2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { SAVED_PLACE_KEYS, SAVED_PLACE_LABELS } from "@/lib/savedPlaces";
import type { SavedPlaceKey, SavedPlaces } from "@/types";

export const SAVED_PLACE_ICONS: Record<SavedPlaceKey, LucideIcon> = {
  home: House,
  work: Briefcase,
  college: GraduationCap,
};

interface QuickLocationsProps {
  savedPlaces: SavedPlaces;
  onUse: (key: SavedPlaceKey) => void;
  onSet: (key: SavedPlaceKey) => void;
  onManage: () => void;
}

export function QuickLocations({ savedPlaces, onUse, onSet, onManage }: QuickLocationsProps) {
  const [missing, setMissing] = useState<SavedPlaceKey | null>(null);

  return (
    <section aria-labelledby="quick-locations-heading">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="quick-locations-heading" className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Saved places
        </h2>
        <button
          type="button"
          onClick={onManage}
          className="-mr-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-ink-soft hover:bg-cream-deep hover:text-ink"
        >
          <Settings2 className="size-3.5" aria-hidden="true" /> Manage
        </button>
      </div>

      <div className="flex gap-2">
        {SAVED_PLACE_KEYS.map((key) => {
          const Icon = SAVED_PLACE_ICONS[key];
          const saved = savedPlaces[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (saved) {
                  setMissing(null);
                  onUse(key);
                } else {
                  setMissing(key);
                }
              }}
              title={saved ? `${saved.location.name}${saved.location.address ? `, ${saved.location.address}` : ""}` : `${SAVED_PLACE_LABELS[key]} isn't set`}
              className={`inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
                saved
                  ? "border-line bg-paper text-ink hover:border-line-strong hover:bg-cream"
                  : "border-dashed border-line-strong bg-transparent text-ink-muted hover:bg-cream"
              }`}
            >
              <Icon className={`size-4 shrink-0 ${saved ? "text-brand" : ""}`} aria-hidden="true" />
              <span className="truncate">{SAVED_PLACE_LABELS[key]}</span>
            </button>
          );
        })}
      </div>

      {missing && !savedPlaces[missing] && (
        <div
          role="status"
          className="mt-2 flex animate-fade-in items-center justify-between gap-3 rounded-xl bg-cream px-3 py-2 text-sm text-ink-soft"
        >
          <span>{SAVED_PLACE_LABELS[missing]} location isn&apos;t set yet.</span>
          <button
            type="button"
            onClick={() => {
              onSet(missing);
              setMissing(null);
            }}
            className="shrink-0 rounded-lg px-2 py-1 font-semibold text-brand-strong hover:bg-brand-soft"
          >
            Set {SAVED_PLACE_LABELS[missing]}
          </button>
        </div>
      )}
    </section>
  );
}
