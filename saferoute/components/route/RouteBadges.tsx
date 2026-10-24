import { Gauge, ShieldCheck, Zap } from "lucide-react";
import type { RouteLabel } from "@/types";

const LABELS: Record<RouteLabel, { text: string; icon: typeof Zap; className: string }> = {
  fastest: { text: "Fastest", icon: Zap, className: "bg-[#eef0f3] text-ink-soft" },
  balanced: { text: "Balanced", icon: Gauge, className: "bg-[#fdf3e1] text-[#9a5f0a]" },
  safest: { text: "Safest", icon: ShieldCheck, className: "bg-safe-soft text-safe" },
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
            className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[12px] font-semibold ${className}`}
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
