"use client";

import { ChevronDown, CircleAlert, RotateCw, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { formatArrival, formatDistance, formatDuration } from "@/lib/format";
import { RouteBadges } from "./RouteBadges";
import { MetroCard } from "./MetroCard";
import { RouteSafetyFacts } from "./RouteSafetyFacts";
import type { RouteLabel, RouteResponse, RouteSafety, SafetyFactor } from "@/types";

export type RouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; response: RouteResponse }
  | { status: "error"; message: string };

interface RoutePanelProps {
  state: RouteState;
  selectedRouteId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onClear: () => void;
}

type RouteItem = RouteResponse["routes"][number];

const SLOTS: RouteLabel[] = ["fastest", "balanced", "safest"];
const SLOT_NAMES: Record<RouteLabel, string> = { fastest: "Fastest", balanced: "Balanced", safest: "Safest" };
const SAME_ROUTE_REASON: Record<RouteLabel, string> = {
  fastest: "",
  balanced: "it is also the best mix of time and risk on this trip.",
  safest: "it is also the lowest-risk road on this trip.",
};

export function RoutePanel({ state, selectedRouteId, onSelect, onRetry, onClear }: RoutePanelProps) {
  // The card last tapped, for this result only (two cards can show the same route).
  const [tapped, setTapped] = useState<{ at: string; slot: RouteLabel } | null>(null);

  if (state.status === "idle") return null;

  if (state.status === "loading") return <LoadingRoutes />;

  if (state.status === "error") {
    return (
      <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <p className="flex-1 text-ink">{state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="-my-1 inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-medium text-danger hover:bg-paper/70"
        >
          <RotateCw className="size-3.5" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  const { routes, provider, computedAt } = state.response;
  const fastestDuration = Math.min(...routes.map((r) => r.durationSeconds));
  const shortestDistance = Math.min(...routes.map((r) => r.distanceMeters));
  const computedDate = new Date(computedAt);
  const selectedId = selectedRouteId ?? routes[0]?.id;

  const method = state.response.safety;
  const ranked = routes.some((r) => r.labels?.length);

  // Always three cards: Fastest, Balanced, Safest. One route can fill several of them; it is
  // never swapped for a riskier route just to have three different ones.
  const slots = SLOTS.flatMap((slot) => {
    const route = routes.find((r) => r.labels?.includes(slot));
    return route ? [{ slot, route }] : [];
  });
  const inSlots = new Set(slots.map((s) => s.route.id));
  const others = routes.filter((r) => !inSlots.has(r.id));
  const activeSlot = tapped?.at === computedAt ? tapped.slot : "safest";
  const highlighted =
    slots.find((s) => s.slot === activeSlot && s.route.id === selectedId)?.slot ?? slots.find((s) => s.route.id === selectedId)?.slot;

  const cardProps = { computedDate, method };

  return (
    <section aria-labelledby="routes-heading" className="animate-fade-in">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 id="routes-heading" className="text-[13px] font-semibold text-ink-muted">
          {routes.length === 1 ? "Route" : `${routes.length} routes`}
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="-mr-1.5 inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-ink-soft hover:bg-cream-deep hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" /> Clear
        </button>
      </div>

      {state.response.transit && <MetroCard transit={state.response.transit} />}

      {ranked ? (
        <>
          <ul className="sr-stagger flex flex-col gap-2.5" role="radiogroup" aria-label="Fastest, Balanced and Safest routes">
            {slots.map(({ slot, route }, i) => {
              const sameAs = slots.slice(0, i).find((s) => s.route.id === route.id)?.slot;
              return (
                <li key={slot}>
                  <RouteCard
                    {...cardProps}
                    route={route}
                    badge={<RouteBadges labels={[slot]} />}
                    selected={highlighted === slot}
                    compact={sameAs !== undefined}
                    note={sameAs ? `Same route as ${SLOT_NAMES[sameAs]}: ${SAME_ROUTE_REASON[slot]}` : null}
                    onClick={() => {
                      setTapped({ at: computedAt, slot });
                      onSelect(route.id);
                    }}
                  />
                </li>
              );
            })}
          </ul>
          {others.length > 0 && (
            <details className="group mt-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-ink-soft shadow-[0_0_0_1px_rgb(0_0_0/0.07)] [&::-webkit-details-marker]:hidden">
                More routes ({others.length})
                <ChevronDown className="size-4 text-ink-muted transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="mt-2.5 flex flex-col gap-2.5" role="radiogroup" aria-label="More routes">
                {others.map((route) => (
                  <li key={route.id}>
                    <RouteCard {...cardProps} route={route} selected={route.id === selectedId} onClick={() => onSelect(route.id)} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <ul className="sr-stagger flex flex-col gap-2.5" role="radiogroup" aria-label="Available routes">
          {routes.map((route) => {
            // Without backend ranking, only label what the provider's numbers show.
            const tags: string[] = [];
            if (routes.length > 1 && route.durationSeconds === fastestDuration) tags.push("Fastest");
            if (routes.length > 1 && route.distanceMeters === shortestDistance && route.durationSeconds !== fastestDuration) tags.push("Shortest");
            return (
              <li key={route.id}>
                <RouteCard {...cardProps} route={route} tags={tags} selected={route.id === selectedId} onClick={() => onSelect(route.id)} />
              </li>
            );
          })}
        </ul>
      )}

      {method && (
        <details className="group mt-3 rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-soft shadow-[0_0_0_1px_rgb(0_0_0/0.07)]">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium text-ink [&::-webkit-details-marker]:hidden">
            How is “Safest” chosen?
            <ChevronDown className="size-4 text-ink-muted transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-1.5">
            {method.factorsUsed.length > 0
              ? `Routes are compared on: ${method.factorsUsed
                  .map((f) => `${FACTOR_NAMES[f]} (${Math.round(((method.weights[f] ?? 0) / totalWeight(method.weights)) * 100)}%)`)
                  .join(", ")}.`
              : "No safety data was available for these routes, so only the fastest is marked."}
          </p>
          {ranked && (
            <p className="mt-1">
              Safest is the route with the lowest measured risk, Balanced the best mix of time and risk. When the fastest road
              is also the safest, the cards say so instead of calling a riskier road “Safest”.
            </p>
          )}
          <p className="mt-1">{method.crimeDataNote}</p>
          {method.crimeDataAvailable && (
            <p className="mt-1">
              Crime reports from the last {method.incidentWindowDays} days; recent ones and ones closer to the route count more.
            </p>
          )}
          {method.factorsUsed.includes("community") && (
            <p className="mt-1">Community reports count only once several different people have reported the same spot.</p>
          )}
          {state.response.mode !== "driving" && (
            <p className="mt-1">
              {state.response.mode === "walking" ? "On foot" : "By bike"}, darkness and quiet streets count for more, and
              SafeRoute also tries routes through the brightest areas between start and end.
            </p>
          )}
          {method.factorsUsed.includes("nightLight") && (
            <p className="mt-1">
              Night-time brightness comes from NASA Black Marble yearly satellite images (~500 m squares). “Darkest
              areas” are the darkest third of the city.
            </p>
          )}
          <p className="mt-1">
            Roads, lighting, shops, police stations and hospitals come from OpenStreetMap and may be incomplete. A factor
            without enough data is left out rather than guessed.
          </p>
        </details>
      )}

      <p className="mt-3 px-0.5 text-[12px] leading-relaxed text-ink-muted">
        Estimated times without live traffic · {provider}
      </p>
    </section>
  );
}

const FACTOR_NAMES: Record<SafetyFactor, string> = {
  crime: "reported crimes",
  community: "community reports",
  nightLight: "night-time darkness, NASA",
  darkness: "unlit roads",
  mainRoads: "main roads vs side streets",
  activity: "shops & activity nearby",
  police: "distance from police",
  hospital: "distance from hospitals",
};

function totalWeight(weights: Partial<Record<SafetyFactor, number>>): number {
  const sum = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0);
  return sum > 0 ? sum : 1;
}

interface RouteCardProps {
  route: RouteItem;
  selected: boolean;
  onClick: () => void;
  computedDate: Date;
  method: RouteResponse["safety"];
  badge?: ReactNode;
  tags?: string[];
  /** Same route as a card above: just the label, time and why it repeats. */
  compact?: boolean;
  note?: string | null;
}

function RouteCard({ route, selected, onClick, computedDate, method, badge, tags = [], compact = false, note }: RouteCardProps) {
  return (
    <div
      className={`rounded-[18px] bg-paper transition-[box-shadow,transform] duration-200 ${
        selected
          ? "shadow-[0_0_0_2px_var(--color-brand),0_10px_28px_-10px_rgb(0_0_0/0.18)]"
          : "shadow-[0_0_0_1px_rgb(0_0_0/0.07)] hover:-translate-y-px hover:shadow-[0_0_0_1px_rgb(0_0_0/0.1),0_10px_24px_-12px_rgb(0_0_0/0.2)]"
      }`}
    >
      <button type="button" role="radio" aria-checked={selected} onClick={onClick} className="flex w-full flex-col px-4 py-3.5 text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            {badge}
            <span className={`flex items-baseline gap-2 ${badge ? "mt-1.5" : ""}`}>
              <span
                className={`leading-none font-semibold tracking-tight text-ink tabular-nums ${compact ? "text-[17px]" : "text-[22px]"}`}
              >
                {formatDuration(route.durationSeconds)}
              </span>
              <span className="text-[14px] text-ink-muted tabular-nums">{formatDistance(route.distanceMeters)}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {tags.length > 0 && (
              <span className="rounded-full bg-brand-soft px-2 py-[3px] text-[12px] font-semibold text-brand-strong">{tags.join(" · ")}</span>
            )}
            <span
              className={`flex size-5 items-center justify-center rounded-full border-2 transition-colors ${selected ? "border-brand" : "border-black/15"}`}
              aria-hidden="true"
            >
              {selected && <span className="size-2.5 rounded-full bg-brand" />}
            </span>
          </span>
        </span>
        {note && <span className="mt-1.5 block text-[12.5px] leading-snug font-medium text-safe">{note}</span>}
        {!compact && (
          <>
            <span className="mt-1.5 block truncate text-[13px] text-ink-muted">
              {route.summary ? `via ${route.summary}` : `Arrive around ${formatArrival(route.durationSeconds, computedDate)}`}
            </span>
            {route.safety && <QuickFacts safety={route.safety} />}
          </>
        )}
        {selected && route.safety && method && <RouteSafetyFacts safety={route.safety} serviceRadiusMeters={method.serviceRadiusMeters} />}
      </button>
    </div>
  );
}

/** Loading state: placeholder cards; after a few seconds it explains why long trips take a while. */
function LoadingRoutes() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div role="status" className="animate-fade-in">
      <p className="mb-2.5 flex items-center gap-2 text-[13px] font-medium text-ink-soft">
        <Spinner className="size-3.5" /> Finding routes and checking safety along them…
      </p>
      <div className="flex flex-col gap-2.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[18px] px-4 py-3.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
            <div className="h-5 w-16 animate-pulse rounded-full bg-black/[0.06]" style={{ animationDelay: `${i * 120}ms` }} />
            <div className="mt-2.5 h-6 w-28 animate-pulse rounded-md bg-black/[0.07]" style={{ animationDelay: `${i * 120}ms` }} />
            <div className="mt-2 h-3.5 w-40 animate-pulse rounded bg-black/[0.05]" style={{ animationDelay: `${i * 120}ms` }} />
          </div>
        ))}
      </div>
      {slow && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-muted">
          Long trips take longer: every route is checked against crime reports and street data. This can take up to 40 seconds.
        </p>
      )}
    </div>
  );
}

/** Two or three headline facts, so routes can be compared without opening each one. */
function QuickFacts({ safety }: { safety: RouteSafety }) {
  const chips: Array<{ text: string; tone: "good" | "warn" | "neutral" }> = [];
  if (safety.crime.available) {
    const n = safety.crime.incidentCount;
    chips.push(n === 0 ? { text: "No reported crime", tone: "good" } : { text: `${n} reported area${n === 1 ? "" : "s"}`, tone: "warn" });
  }
  if (safety.lighting.available && safety.lighting.unknownFraction < 0.8) {
    chips.push({ text: `${Math.round(safety.lighting.litFraction * 100)}% lit`, tone: safety.lighting.unlitFraction > 0.3 ? "warn" : "neutral" });
  }
  if (safety.police.available) chips.push({ text: `Police near ${Math.round(safety.police.coverageFraction * 100)}%`, tone: "neutral" });
  if (!chips.length) return null;
  const tone = { good: "bg-safe-soft text-safe", warn: "bg-danger-soft text-danger", neutral: "bg-[#f2f2f4] text-ink-soft" };
  return (
    <span className="mt-2.5 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.text} className={`rounded-full px-2 py-[3px] text-[12px] font-medium tabular-nums ${tone[c.tone]}`}>
          {c.text}
        </span>
      ))}
    </span>
  );
}
