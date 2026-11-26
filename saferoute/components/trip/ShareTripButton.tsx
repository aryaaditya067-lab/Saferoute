"use client";

import { Check, Copy, ExternalLink, MessageCircle, Phone, Share2, X } from "lucide-react";
import { useCallback, useState } from "react";
import type { Location, Route } from "@/types";

interface ShareTripProps {
  pickup: Location | null;
  destination: Location | null;
  selectedRoute: Route | undefined;
}

function buildShareText(pickup: Location | null, destination: Location | null, route: Route | undefined): string {
  const parts: string[] = ["I'm using SafeRoute!"];
  if (pickup) parts.push(`From: ${pickup.name}${pickup.address ? ` (${pickup.address})` : ""}`);
  if (destination) parts.push(`To: ${destination.name}${destination.address ? ` (${destination.address})` : ""}`);
  if (route) {
    const km = (route.distanceMeters / 1000).toFixed(1);
    const mins = Math.round(route.durationSeconds / 60);
    parts.push(`Distance: ${km} km, ~${mins} min`);
    if (route.labels?.includes("safest")) parts.push("Taking the safest route.");
  }
  parts.push("\nTrack my trip on SafeRoute.");
  return parts.join("\n");
}

function buildShareUrl(pickup: Location | null, destination: Location | null): string {
  const params = new URLSearchParams();
  if (pickup) params.set("from", `${pickup.lat},${pickup.lng}`);
  if (destination) params.set("to", `${destination.lat},${destination.lng}`);
  return `${window.location.origin}/app?${params.toString()}`;
}

export function ShareTripButton({ pickup, destination, selectedRoute }: ShareTripProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasTrip = pickup && destination;

  const shareText = buildShareText(pickup, destination, selectedRoute);
  const shareUrl = typeof window !== "undefined" ? buildShareUrl(pickup, destination) : "";

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title: "My SafeRoute Trip", text: shareText, url: shareUrl });
      setOpen(false);
    } catch {
      // User cancelled.
    }
  }, [shareText, shareUrl]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked.
    }
  }, [shareText, shareUrl]);

  const handleWhatsApp = useCallback(() => {
    const text = encodeURIComponent(`${shareText}\n${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
    setOpen(false);
  }, [shareText, shareUrl]);

  const handleSMS = useCallback(() => {
    const text = encodeURIComponent(`${shareText}\n${shareUrl}`);
    window.location.href = `sms:?body=${text}`;
    setOpen(false);
  }, [shareText, shareUrl]);

  if (!hasTrip) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2.5 text-[13px] font-semibold text-ink shadow-control transition-colors hover:bg-cream"
      >
        <Share2 className="size-4 text-brand" />
        Share trip
      </button>

      {open && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/60 backdrop-blur-sm md:items-center">
          <div className="w-full max-w-sm animate-slide-down rounded-t-3xl bg-paper p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-float md:rounded-3xl md:pb-6">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-full bg-brand/10">
                  <Share2 className="size-4.5 text-brand" />
                </div>
                <h2 className="text-lg font-bold text-ink">Share your trip</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-full hover:bg-cream"
                aria-label="Close"
              >
                <X className="size-5 text-ink-muted" />
              </button>
            </div>

            {/* Trip summary card */}
            <div className="mb-5 rounded-2xl border border-line bg-cream p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex flex-col items-center gap-0.5">
                  <div className="size-2.5 rounded-full bg-safe ring-2 ring-safe/20" />
                  <div className="h-7 w-px bg-gradient-to-b from-safe/40 to-brand/40" />
                  <div className="size-2.5 rounded-full bg-brand ring-2 ring-brand/20" />
                </div>
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">From</p>
                    <p className="truncate text-[13px] font-medium text-ink">{pickup?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">To</p>
                    <p className="truncate text-[13px] font-medium text-ink">{destination?.name ?? "—"}</p>
                  </div>
                </div>
              </div>
              {selectedRoute && (
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                  <span className="rounded-lg bg-paper px-2 py-1 text-[12px] font-medium text-ink-soft shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
                    {(selectedRoute.distanceMeters / 1000).toFixed(1)} km
                  </span>
                  <span className="rounded-lg bg-paper px-2 py-1 text-[12px] font-medium text-ink-soft shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
                    ~{Math.round(selectedRoute.durationSeconds / 60)} min
                  </span>
                  {selectedRoute.labels?.includes("safest") && (
                    <span className="rounded-lg bg-safe-soft px-2 py-1 text-[12px] font-semibold text-safe">
                      Safest
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Share options grid */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <ShareIcon
                bg="bg-[#25D366]"
                label="WhatsApp"
                onClick={handleWhatsApp}
                icon={<MessageCircle className="size-5 text-white" strokeWidth={2.2} />}
              />
              <ShareIcon
                bg="bg-[#3B82F6]"
                label="SMS"
                onClick={handleSMS}
                icon={<Phone className="size-5 text-white" strokeWidth={2.2} />}
              />
              <ShareIcon
                bg={copied ? "bg-safe" : "bg-ink-soft"}
                label={copied ? "Copied!" : "Copy"}
                onClick={handleCopy}
                icon={copied ? <Check className="size-5 text-white" strokeWidth={2.5} /> : <Copy className="size-5 text-white" strokeWidth={2.2} />}
              />
              {typeof navigator !== "undefined" && "share" in navigator && (
                <ShareIcon
                  bg="bg-brand"
                  label="More"
                  onClick={handleNativeShare}
                  icon={<ExternalLink className="size-5 text-white" strokeWidth={2.2} />}
                />
              )}
            </div>

            {/* Link preview */}
            <button
              type="button"
              onClick={handleCopy}
              className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-cream/60 px-3.5 py-2.5 transition-colors hover:bg-cream"
            >
              <Copy className="size-3.5 shrink-0 text-ink-muted" />
              <span className="flex-1 truncate text-left text-[12px] text-ink-soft">{shareUrl}</span>
              <span className="shrink-0 text-[11px] font-semibold text-brand">
                {copied ? "Copied!" : "Copy"}
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ShareIcon({ bg, label, onClick, icon }: { bg: string; label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5"
    >
      <div className={`flex size-12 items-center justify-center rounded-2xl ${bg} shadow-[0_2px_8px_rgb(0_0_0/0.12)] transition-transform duration-150 hover:scale-105 active:scale-95`}>
        {icon}
      </div>
      <span className="text-[11px] font-medium text-ink-soft">{label}</span>
    </button>
  );
}
