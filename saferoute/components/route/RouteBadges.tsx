import { Gauge, ShieldCheck, Zap } from "lucide-react";
import type { RouteLabel } from "@/types";

const LABELS: Record<RouteLabel, { text: string; icon: typeof Zap; className: string }> = {
  fastest: { text: "Fastest", icon: Zap, className: "bg-ink text-paper" },
  balanced: { text: "Balanced", icon: Gauge, className: "bg-cream-deep text-ink ring-1 ring-line-strong" },
  safest: { text: "Safest", icon: ShieldCheck, className: "bg-safe-soft text-safe ring-1 ring-safe/30" },
};

const ORDER: RouteLabel[] = ["fastest", "balanced", "safest"];

export function RouteBadges({ labels }: { labels: RouteLabel[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {ORDER.filter((l) => labels.includes(l)).map((label) => {
        const { text, icon: Icon, className } = LABELS[label];
        return (
          <span
            key={label}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
          >
            <Icon className="size-3" aria-hidden="true" />
            {text}
          </span>
        );
      })}
    </span>
  );
}

export function labelText(labels: RouteLabel[] | undefined): string {
  if (!labels?.length) return "";
  return ORDER.filter((l) => labels.includes(l))
    .map((l) => LABELS[l].text)
    .join(" · ");
}
