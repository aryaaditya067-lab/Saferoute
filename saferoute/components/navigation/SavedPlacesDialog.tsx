"use client";

import { ArrowLeft, Crosshair, MapPinned, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { formatCoordinates } from "@/lib/geo";
import { SAVED_PLACE_KEYS, SAVED_PLACE_LABELS } from "@/lib/savedPlaces";
import type { Coordinates, Location, SavedPlaceKey, SavedPlaces } from "@/types";
import { LocationField } from "./LocationField";
import { SAVED_PLACE_ICONS } from "./QuickLocations";

interface SavedPlacesDialogProps {
  savedPlaces: SavedPlaces;
  /** Open straight into the editor for this place. */
  initialKey: SavedPlaceKey | null;
  pickup: Location | null;
  destination: Location | null;
  getNear: () => Coordinates | undefined;
  onClose: () => void;
  onSave: (key: SavedPlaceKey, location: Location) => void;
  onRemove: (key: SavedPlaceKey) => void;
  onPickOnMap: (key: SavedPlaceKey) => void;
  /** Resolves true when saved, false when location couldn't be obtained. */
  onUseCurrentLocation: (key: SavedPlaceKey) => Promise<boolean>;
}

export function savedPlaceSubtitle(location: Location): string {
  if (location.source === "search") {
    return [location.name, location.address].filter(Boolean).join(", ");
  }
  return location.address ?? formatCoordinates(location);
}

export function SavedPlacesDialog({
  savedPlaces,
  initialKey,
  pickup,
  destination,
  getNear,
  onClose,
  onSave,
  onRemove,
  onPickOnMap,
  onUseCurrentLocation,
}: SavedPlacesDialogProps) {
  const [editing, setEditing] = useState<SavedPlaceKey | null>(initialKey);
  const [locating, setLocating] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!editing) dialogRef.current?.focus();
  }, [editing]);

  const label = editing ? SAVED_PLACE_LABELS[editing] : null;

  function save(location: Location) {
    if (!editing) return;
    onSave(editing, location);
    setEditing(null);
  }

  const reuseOptions = [
    pickup && { id: "pickup", text: "Use pickup", location: pickup },
    destination && { id: "destination", text: "Use destination", location: destination },
  ].filter(Boolean) as Array<{ id: string; text: string; location: Location }>;

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center md:items-center" role="presentation">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in cursor-default bg-ink/30"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-places-title"
        tabIndex={-1}
        className="relative max-h-[88dvh] w-full animate-slide-down overflow-y-auto rounded-t-3xl border border-line bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-float outline-none scrollbar-thin md:w-[420px] md:rounded-3xl md:p-5"
      >
        <div className="mb-4 flex items-center gap-2">
          {editing && !initialKey && (
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Back to saved places"
              className="-ml-1 inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-cream-deep hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          )}
          <h2 id="saved-places-title" className="flex-1 text-base font-semibold text-ink">
            {label ? `Set ${label}` : "Saved places"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-cream-deep hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <LocationField
              label={`${label} address`}
              placeholder={`Search ${label?.toLowerCase()} address`}
              value={null}
              marker="search"
              getNear={getNear}
              onSelect={save}
              autoFocus
            />
            <p className="text-xs text-ink-muted">Saved only in this browser.</p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={locating}
                onClick={async () => {
                  setLocating(true);
                  const ok = await onUseCurrentLocation(editing);
                  setLocating(false);
                  if (ok) setEditing(null);
                }}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-cream disabled:opacity-60"
              >
                {locating ? <Spinner className="size-4 text-locate" /> : <Crosshair className="size-4 text-locate" aria-hidden="true" />}
                {locating ? "Finding your location…" : "Use my current location"}
              </button>
              <button
                type="button"
                onClick={() => onPickOnMap(editing)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-cream"
              >
                <MapPinned className="size-4 text-ink-soft" aria-hidden="true" />
                Choose on map
              </button>
              {reuseOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => save(option.location)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-cream"
                >
                  <span className="flex size-4 items-center justify-center" aria-hidden="true">
                    <span className={`size-2.5 rounded-full ${option.id === "pickup" ? "bg-ink" : "bg-brand"}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{option.text}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {option.location.name}
                      {option.location.address ? ` · ${option.location.address}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {SAVED_PLACE_KEYS.map((key) => {
              const Icon = SAVED_PLACE_ICONS[key];
              const saved = savedPlaces[key];
              return (
                <li key={key} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cream">
                    <Icon className={`size-4 ${saved ? "text-brand" : "text-ink-muted"}`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{SAVED_PLACE_LABELS[key]}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {saved ? savedPlaceSubtitle(saved.location) : "Not set"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(key)}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
                  >
                    {saved ? "Change" : "Set"}
                  </button>
                  {saved && (
                    <button
                      type="button"
                      onClick={() => onRemove(key)}
                      aria-label={`Remove ${SAVED_PLACE_LABELS[key]}`}
                      title="Remove"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
