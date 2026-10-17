import { TrainFront } from "lucide-react";
import type { TransitInfo, TransitStation } from "@/types";

function walkText(m: number | null): string {
  if (m == null) return "";
  const minutes = Math.max(1, Math.round(m / 80)); // ~4.8 km/h walking pace
  return m < 1000 ? `${Math.round(m / 10) * 10} m · ${minutes} min walk` : `${(m / 1000).toFixed(1)} km · ${minutes} min walk`;
}

function Status({ station }: { station: TransitStation }) {
  if (station.openNow === true) {
    return <span className="rounded-full bg-safe-soft px-2 py-0.5 text-[11px] font-semibold text-safe">Open now</span>;
  }
  if (station.openNow === false) {
    return <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">Closed now</span>;
  }
  return <span className="rounded-full bg-cream-deep px-2 py-0.5 text-[11px] font-semibold text-ink-muted">Hours not listed</span>;
}

function Row({ label, station }: { label: string; station: TransitStation | null }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="w-14 shrink-0 pt-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      {station ? (
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">{station.name}</span>
            <Status station={station} />
          </span>
          <span className="block text-xs text-ink-soft">
            {walkText(station.distanceMeters)}
            {station.hoursToday && ` · today ${station.hoursToday}`}
          </span>
          {station.hoursSource && station.hoursSource !== "OpenStreetMap" && (
            <span className="block text-[11px] text-ink-muted">Hours from {station.hoursSource}</span>
          )}
        </span>
      ) : (
        <span className="flex-1 text-sm text-ink-muted">No metro station within 1.2 km</span>
      )}
    </li>
  );
}

/** Walking trips: the nearest metro station to the start and to the end, with today's hours. */
export function MetroCard({ transit }: { transit: TransitInfo }) {
  return (
    <section aria-labelledby="metro-heading" className="mb-3 rounded-xl border border-line bg-paper px-3.5 pt-3 pb-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="metro-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="inline-flex size-6 items-center justify-center rounded-lg bg-[#1F7A8C] text-white">
            <TrainFront className="size-3.5" aria-hidden="true" />
          </span>
          Metro near your walk
        </h3>
        <span className="text-[11px] text-ink-muted tabular-nums">Local time {transit.localTime}</span>
      </div>
      {transit.dataAvailable ? (
        <ul className="mt-1 divide-y divide-line">
          <Row label="Start" station={transit.nearStart} />
          <Row label="End" station={transit.nearEnd} />
        </ul>
      ) : null}
      <p className="pb-1 text-[11px] leading-snug text-ink-muted">{transit.note}</p>
    </section>
  );
}
