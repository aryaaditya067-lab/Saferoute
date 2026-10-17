"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { describeError, serverMessage } from "@/lib/errors";
import { formatCoordinates } from "@/lib/geo";
import { REPORT_CATEGORIES, submitCommunityReport } from "@/services/community";
import type { CommunitySpot, Coordinates, ReportCategory } from "@/types";

interface ReportDialogProps {
  point: Coordinates;
  placeLabel: string | null;
  confirmThreshold: number;
  onClose: () => void;
  onSubmitted: (spot: CommunitySpot) => void;
}

/** Report a safety issue at a point on the map. */
export function ReportDialog({ point, placeLabel, confirmThreshold, onClose, onSubmitted }: ReportDialogProps) {
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function submit() {
    if (!category) {
      setError("Choose what you want to report.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const spot = await submitCommunityReport({ category, lat: point.lat, lng: point.lng, note });
      onSubmitted(spot);
    } catch (e) {
      setError(serverMessage(e) ?? describeError(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center md:items-center" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 animate-fade-in cursor-default bg-ink/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="relative max-h-[90dvh] w-full animate-slide-down overflow-y-auto rounded-t-3xl border border-line bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-float scrollbar-thin md:w-[440px] md:rounded-3xl md:p-5"
      >
        <div className="mb-3 flex items-start gap-2">
          <div className="flex-1">
            <h2 id="report-title" className="text-base font-semibold text-ink">Report a safety issue</h2>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
              <MapPin className="size-3.5" aria-hidden="true" />
              {placeLabel ?? formatCoordinates(point)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-cream-deep hover:text-ink">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div role="radiogroup" aria-label="What happened here?" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {REPORT_CATEGORIES.map((c) => {
            const active = c.id === category;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setCategory(c.id);
                  setError(null);
                }}
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active ? "border-brand bg-brand-soft/50" : "border-line hover:border-line-strong hover:bg-cream/60"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden="true">{c.emoji}</span>
                <span>
                  <span className="block text-sm font-medium text-ink">{c.label}</span>
                  <span className="block text-[11px] leading-snug text-ink-muted">{c.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-3 block text-xs font-medium text-ink-soft" htmlFor="report-note">
          Details (optional)
        </label>
        <textarea
          id="report-note"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. No street lights after the bus stop"
          className="mt-1 w-full resize-none rounded-xl border border-line bg-cream/50 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-line-strong focus:bg-paper"
        />
        <div className="mt-0.5 text-right text-[11px] text-ink-muted tabular-nums">{note.length}/200</div>

        {error && (
          <p role="alert" className="mt-1 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          Don&apos;t include names or phone numbers. A spot affects routes once {confirmThreshold} different people report it.
          Reports expire after a while.
        </p>

        <button
          type="button"
          onClick={submit}
          disabled={sending}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-paper hover:bg-brand-strong disabled:opacity-80"
        >
          {sending && <Spinner className="size-4" />}
          {sending ? "Sending…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}
