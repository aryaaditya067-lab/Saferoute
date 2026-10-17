"use client";

import { CircleAlert, MapPin, Navigation, RotateCw, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { formatCoordinates } from "@/lib/geo";
import { usePlaceSearch } from "@/lib/hooks";
import { MIN_QUERY_LENGTH } from "@/services/geocoding";
import type { Coordinates, Location } from "@/types";

export type FieldMarker = "pickup" | "destination" | "search";

interface LocationFieldProps {
  label: string;
  placeholder: string;
  value: Location | null;
  marker: FieldMarker;
  error?: string;
  /** Point used to rank nearby results first. */
  getNear: () => Coordinates | undefined;
  onSelect: (location: Location) => void;
  onClear?: () => void;
  /** Extra buttons shown at the end of the field (locate, pick on map…). */
  actions?: ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  /** Visually merge with a sibling field (stacked pickup/destination). */
  embedded?: boolean;
}

function MarkerGlyph({ marker }: { marker: FieldMarker }) {
  if (marker === "pickup") {
    return (
      <span className="flex size-5 items-center justify-center" aria-hidden="true">
        <span className="size-3 rounded-full border-[3px] border-ink bg-paper" />
      </span>
    );
  }
  if (marker === "destination") {
    return (
      <span className="flex size-5 items-center justify-center" aria-hidden="true">
        <MapPin className="size-[18px] fill-brand text-brand [&>circle]:fill-paper [&>circle]:stroke-paper" />
      </span>
    );
  }
  return null;
}

export function LocationField({
  label,
  placeholder,
  value,
  marker,
  error,
  getNear,
  onSelect,
  onClear,
  actions,
  inputRef,
  autoFocus,
  embedded = false,
}: LocationFieldProps) {
  const listId = useId();
  const errorId = useId();
  const ownInputRef = useRef<HTMLInputElement | null>(null);
  const localInputRef = inputRef ?? ownInputRef;
  const [draft, setDraft] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const search = usePlaceSearch(getNear);

  const editing = draft !== null;
  const displayValue = draft ?? value?.name ?? "";
  const showPanel = editing && draft.trim().length > 0;
  const results = search.status === "success" ? search.results : [];
  const activeOptionId = activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined;

  function stopEditing() {
    setDraft(null);
    setActiveIndex(-1);
    search.reset();
  }

  function choose(location: Location) {
    onSelect(location);
    stopEditing();
    localInputRef.current?.blur();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      const pick = results[activeIndex] ?? (results.length ? results[0] : undefined);
      if (pick) {
        event.preventDefault();
        choose(pick);
      }
    } else if (event.key === "Escape") {
      stopEditing();
      localInputRef.current?.blur();
    }
  }

  function handleClear() {
    if (editing && draft) {
      setDraft("");
      search.reset();
      localInputRef.current?.focus();
      return;
    }
    stopEditing();
    onClear?.();
    localInputRef.current?.focus();
  }

  const caption = !editing && value ? (value.address ?? formatCoordinates(value)) : null;
  const accuracy =
    !editing && value?.source === "geolocation" && value.accuracyMeters
      ? `±${Math.round(value.accuracyMeters)} m`
      : null;

  return (
    <div className="min-w-0">
      <div
        className={`flex items-center gap-2.5 pl-3 pr-1.5 transition-colors ${
          embedded
            ? "rounded-xl"
            : `rounded-xl border bg-cream/60 ${error ? "border-danger" : "border-line focus-within:border-line-strong focus-within:bg-paper"}`
        } ${embedded && error ? "bg-danger-soft/60" : ""}`}
      >
        <MarkerGlyph marker={marker} />
        <div className="min-w-0 flex-1 py-1.5">
          <input
            ref={localInputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={autoFocus}
            role="combobox"
            aria-label={label}
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            placeholder={placeholder}
            value={displayValue}
            onChange={(event) => {
              setDraft(event.target.value);
              setActiveIndex(-1);
              search.search(event.target.value);
            }}
            onFocus={(event) => {
              if (value && !editing) event.target.select();
            }}
            onBlur={stopEditing}
            onKeyDown={handleKeyDown}
            className="h-7 w-full truncate bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-muted"
          />
          {caption && (
            <p className="truncate text-xs text-ink-muted" title={caption}>
              {value?.source === "geolocation" && (
                <Navigation className="mr-1 inline size-3 -translate-y-px fill-locate text-locate" aria-hidden="true" />
              )}
              {caption}
              {accuracy && <span className="ml-1 text-ink-muted/80">· {accuracy}</span>}
            </p>
          )}
        </div>
        {(value || (editing && draft)) && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClear}
            aria-label={editing && draft ? "Clear search text" : `Clear ${label.toLowerCase()}`}
            title="Clear"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-cream-deep hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
        {actions}
      </div>

      {error && (
        <p id={errorId} className="mt-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-danger">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {showPanel && (
        <div
          className="mt-1.5 animate-fade-in overflow-hidden rounded-xl border border-line bg-paper"
          onMouseDown={(event) => event.preventDefault()}
        >
          {search.query.length < MIN_QUERY_LENGTH ? (
            <p className="px-3.5 py-3 text-sm text-ink-muted">Type at least {MIN_QUERY_LENGTH} characters to search.</p>
          ) : search.status === "loading" ? (
            <p className="flex items-center gap-2 px-3.5 py-3 text-sm text-ink-soft" role="status">
              <Spinner /> Searching…
            </p>
          ) : search.status === "error" ? (
            <div className="flex items-center gap-2 px-3.5 py-2.5 text-sm" role="alert">
              <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="flex-1 text-ink-soft">{search.error}</p>
              <button
                type="button"
                onClick={search.retry}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-brand-strong hover:bg-brand-soft"
              >
                <RotateCw className="size-3.5" aria-hidden="true" /> Retry
              </button>
            </div>
          ) : search.status === "success" && results.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-ink-muted" role="status">
              No places found for “{search.query}”. Try another spelling or a nearby landmark.
            </p>
          ) : null}

          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-72 overflow-y-auto scrollbar-thin">
            {results.map((place, index) => (
              <li
                key={place.id}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => choose(place)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-start gap-3 border-t border-line/70 px-3.5 py-2.5 first:border-t-0 ${
                  index === activeIndex ? "bg-cream" : ""
                }`}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{place.name}</p>
                  {place.address && <p className="truncate text-xs text-ink-muted">{place.address}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
