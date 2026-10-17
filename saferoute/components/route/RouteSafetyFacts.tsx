import { Building2, Clock3, Lightbulb, MessageCircleWarning, MessageSquareWarning, MoonStar, Route as RouteIcon, Siren, Store } from "lucide-react";
import type { ReactNode } from "react";
import type { RouteSafety } from "@/types";

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const formatMeters = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

type Tone = "good" | "warn" | "neutral" | "muted";

const TONE: Record<Tone, string> = {
  good: "text-safe",
  warn: "text-danger",
  neutral: "text-ink",
  muted: "text-ink-muted",
};

function Row({ icon, label, value, tone = "neutral", detail }: { icon: ReactNode; label: string; value: string; tone?: Tone; detail: string }) {
  return (
    <div className="flex items-center gap-2 py-[5px]" title={detail}>
      <dt className="flex min-w-0 flex-1 items-center gap-2 text-ink-soft">
        <span className="shrink-0 text-ink-muted" aria-hidden="true">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className={`text-right font-semibold whitespace-nowrap tabular-nums ${TONE[tone]}`}>
        {value}
        <span className="sr-only">. {detail}</span>
      </dd>
    </div>
  );
}

/**
 * Measured facts about a route as a compact label / value list. Each row keeps the full
 * sentence as its tooltip and for screen readers. Factors without data say so.
 */
export function RouteSafetyFacts({ safety, serviceRadiusMeters }: { safety: RouteSafety; serviceRadiusMeters: number }) {
  const { crime, community, lighting, roads, activity, police, hospital, nightLight, openNow } = safety;
  const radius = serviceRadiusMeters >= 1000 ? `${serviceRadiusMeters / 1000} km` : `${serviceRadiusMeters} m`;
  const ic = "size-3.5";

  const crimeRow = !crime.available
    ? { value: "Not available", tone: "muted" as Tone, detail: "Crime reports are not available for this trip." }
    : crime.incidentCount === 0
      ? { value: "None on route", tone: "good" as Tone, detail: "No reported crime areas on this route." }
      : {
          value: `${crime.incidentCount} area${crime.incidentCount === 1 ? "" : "s"}${crime.violentCount > 0 ? ` · ${crime.violentCount} violent` : ""}`,
          tone: "warn" as Tone,
          detail:
            `Passes ${crime.incidentCount} reported crime area${crime.incidentCount === 1 ? "" : "s"}` +
            (crime.nearestMeters == null ? "." : crime.nearestMeters < 20 ? "; one is right on the route." : `; the closest is ${formatMeters(crime.nearestMeters)} away.`),
        };

  return (
    <dl className="mt-2.5 rounded-lg border border-line bg-paper/80 px-2.5 py-1 text-xs">
      <Row icon={<MessageCircleWarning className={ic} />} label="Crime reports" {...crimeRow} />

      {community?.available && (
        <Row
          icon={<MessageSquareWarning className={ic} />}
          label="Community reports"
          value={community.spotCount === 0 ? "None" : `${community.spotCount} spot${community.spotCount === 1 ? "" : "s"}`}
          tone={community.spotCount === 0 ? "good" : "warn"}
          detail={
            community.spotCount === 0
              ? "No community-flagged spots on this route."
              : `${community.spotCount} community-flagged spot${community.spotCount === 1 ? "" : "s"} (${community.categories.join(", ")}).`
          }
        />
      )}

      {nightLight?.available && nightLight.coveredFraction >= 0.5 && (
        <Row
          icon={<MoonStar className={ic} />}
          label="Night brightness (NASA)"
          value={nightLight.darkFraction === 0 ? "Bright" : `${pct(nightLight.darkFraction)} dark`}
          tone={nightLight.darkFraction === 0 ? "good" : nightLight.darkFraction > 0.3 ? "warn" : "neutral"}
          detail={
            nightLight.darkFraction === 0
              ? "The whole route is in brighter parts of the city at night (NASA satellite)."
              : `${pct(nightLight.darkFraction)} of the route goes through the city's darkest areas at night (NASA satellite).`
          }
        />
      )}

      {nightLight?.available && (nightLight.longestDarkMeters ?? 0) >= 150 && (
        <Row
          icon={<MoonStar className={ic} />}
          label="Longest dark stretch"
          value={formatMeters(nightLight.longestDarkMeters ?? 0)}
          tone={(nightLight.longestDarkMeters ?? 0) > 500 ? "warn" : "neutral"}
          detail={`The longest continuous part of the route through the city's darkest areas at night is ${formatMeters(nightLight.longestDarkMeters ?? 0)}. It's marked with dark dots on the map.`}
        />
      )}

      {lighting.available && (
        <Row
          icon={<Lightbulb className={ic} />}
          label="Street lights (OSM)"
          value={lighting.unknownFraction >= 0.8 ? "Not mapped" : `${pct(lighting.litFraction)} lit`}
          tone={lighting.unknownFraction >= 0.8 ? "muted" : lighting.unlitFraction > 0.3 ? "warn" : "neutral"}
          detail={`${pct(lighting.litFraction)} lit, ${pct(lighting.unlitFraction)} unlit, ${pct(lighting.unknownFraction)} not mapped in OpenStreetMap.`}
        />
      )}

      {roads?.available && roads.mainRoadFraction + roads.minorRoadFraction >= 0.5 && (
        <Row
          icon={<RouteIcon className={ic} />}
          label="On main roads"
          value={pct(roads.mainRoadFraction)}
          detail={`${pct(roads.mainRoadFraction)} on main roads, ${pct(roads.minorRoadFraction)} on smaller streets.`}
        />
      )}

      {activity?.available && (
        <Row
          icon={<Store className={ic} />}
          label="Shops & eateries"
          value={activity.placeCount === 0 ? "None mapped" : `${activity.placeCount} · ${activity.placesPerKm.toFixed(1)}/km`}
          tone={activity.placeCount === 0 ? "muted" : "neutral"}
          detail={`${activity.placeCount} shops, eateries and ATMs within 100 m of the route.`}
        />
      )}

      {openNow?.available && openNow.withHours > 0 && (
        <Row
          icon={<Clock3 className={ic} />}
          label={`Open now${openNow.checkedAt ? ` (${openNow.checkedAt})` : ""}`}
          value={`${openNow.openNow} of ${openNow.withHours}`}
          tone={openNow.openNow === 0 ? "warn" : "neutral"}
          detail={`${openNow.openNow} of ${openNow.withHours} nearby places with listed hours are open now.`}
        />
      )}

      {police.available && (
        <Row
          icon={<Siren className={ic} />}
          label={`Police within ${radius}`}
          value={pct(police.coverageFraction)}
          detail={`${pct(police.coverageFraction)} of the route is within ${radius} of a police station.`}
        />
      )}
      {hospital.available && (
        <Row
          icon={<Building2 className={ic} />}
          label={`Hospital within ${radius}`}
          value={pct(hospital.coverageFraction)}
          detail={`${pct(hospital.coverageFraction)} of the route is within ${radius} of a hospital.`}
        />
      )}
    </dl>
  );
}
