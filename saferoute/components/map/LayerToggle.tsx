"use client";

import { CircleAlert } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";

interface LayerToggleProps {
  label: string;
  shortLabel: string;
  dotClass: string;
  status: "idle" | "loading" | "ready" | "error" | "zoomed-out";
  count: number;
  emptyText?: string | null;
  title: string;
  error: string | null;
  visible: boolean;
  onToggle: () => void;
  onRetry: () => void;
}

/** Map chip that shows/hides a data layer and how many items are in view. */
export function LayerToggle(p: LayerToggleProps) {
  let detail: React.ReactNode;
  if (p.status === "loading") detail = <Spinner className="size-3.5 text-ink-muted" />;
  else if (p.status === "zoomed-out") detail = <span className="hidden text-ink-muted sm:inline">Zoom in</span>;
  else if (p.status === "error") detail = <CircleAlert className="size-3.5 text-danger" aria-hidden="true" />;
  else if (p.status === "ready" && p.emptyText) detail = <span className="hidden text-ink-muted sm:inline">{p.emptyText}</span>;
  else if (p.status === "ready") detail = <span className="hidden tabular-nums sm:inline">{p.count} in view</span>;

  return (
    <button
      type="button"
      onClick={p.status === "error" ? p.onRetry : p.onToggle}
      aria-pressed={p.visible}
      title={p.status === "error" ? `${p.error} Click to retry.` : p.title}
      className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-cream"
    >
      <span className={`size-2.5 shrink-0 rounded-full ${p.visible ? p.dotClass : "bg-line-strong"}`} aria-hidden="true" />
      <span className="flex-1 truncate">
        <span className="hidden sm:inline">{p.label}</span>
        <span className="sm:hidden">{p.shortLabel}</span>
      </span>
      {detail && <span className="text-xs font-normal text-ink-muted">{detail}</span>}
      <Switch on={p.visible} />
    </button>
  );
}

export function Switch({ on, dark = false }: { on: boolean; dark?: boolean }) {
  return (
    <span
      className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${on ? (dark ? "bg-[#fbbf24]" : "bg-brand") : "bg-line-strong"}`}
      aria-hidden="true"
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left] duration-200 ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </span>
  );
}
