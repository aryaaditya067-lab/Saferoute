"use client";

import { Check, Copy, Link2, MessageCircle, Share2, X } from "lucide-react";
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
  return `${window.location.origin}/?${params.toString()}`;
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
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Share your trip</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-full hover:bg-cream"
                aria-label="Close"
              >
                <X className="size-5 text-ink-muted" />
              </button>
            </div>

            {/* Trip summary */}
            <div className="mb-5 rounded-2xl border border-line bg-cream p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex flex-col items-center gap-1">
                  <div className="size-2.5 rounded-full bg-safe" />
                  <div className="h-6 w-px bg-line-strong" />
                  <div className="size-2.5 rounded-full bg-brand" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-[11px] font-medium text-ink-muted">FROM</p>
                    <p className="text-sm font-medium text-ink">{pickup?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-ink-muted">TO</p>
                    <p className="text-sm font-medium text-ink">{destination?.name ?? "—"}</p>
                  </div>
                </div>
              </div>
              {selectedRoute && (
                <div className="mt-3 flex gap-3 border-t border-line pt-3 text-[12px] text-ink-soft">
                  <span>{(selectedRoute.distanceMeters / 1000).toFixed(1)} km</span>
                  <span>~{Math.round(selectedRoute.durationSeconds / 60)} min</span>
                  {selectedRoute.labels?.includes("safest") && (
                    <span className="rounded-full bg-safe-soft px-2 py-0.5 font-medium text-safe">Safest</span>
                  )}
                </div>
              )}
            </div>

            {/* Share options */}
            <div className="flex flex-col gap-2">
              {typeof navigator !== "undefined" && "share" in navigator && (
                <ShareOption icon={<Share2 className="size-4" />} label="Share via..." onClick={handleNativeShare} />
              )}
              <ShareOption icon={<MessageCircle className="size-4" />} label="WhatsApp" onClick={handleWhatsApp} />
              <ShareOption icon={<MessageCircle className="size-4" />} label="SMS / Text" onClick={handleSMS} />
              <ShareOption
                icon={copied ? <Check className="size-4 text-safe" /> : <Copy className="size-4" />}
                label={copied ? "Copied!" : "Copy link"}
                onClick={handleCopy}
              />
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2.5">
              <Link2 className="size-4 shrink-0 text-brand" />
              <p className="truncate text-[12px] text-ink-soft">{shareUrl}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ShareOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-cream"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </button>
  );
}
