"use client";

import { Phone, Shield, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const EMERGENCY_CONTACTS = [
  { label: "Police", number: "112", icon: "🚔" },
  { label: "Women Helpline", number: "1091", icon: "🆘" },
  { label: "Ambulance", number: "108", icon: "🚑" },
  { label: "Fire", number: "101", icon: "🚒" },
];

export function SOSButton() {
  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [triggered, setTriggered] = useState(false);

  const startSOS = useCallback(() => {
    setOpen(true);
    setCountdown(5);
    setTriggered(false);
  }, []);

  const cancelSOS = useCallback(() => {
    setOpen(false);
    setCountdown(null);
    setTriggered(false);
  }, []);

  useEffect(() => {
    if (countdown === null || countdown < 0) return;
    if (countdown === 0) {
      setTriggered(true);
      setCountdown(null);
      window.location.href = "tel:112";
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  return (
    <>
      {/* Floating SOS trigger */}
      <button
        type="button"
        onClick={startSOS}
        className="sr-float-in pointer-events-auto fixed bottom-4 right-3 z-[1200] flex size-14 items-center justify-center rounded-full bg-danger text-white shadow-float transition-transform duration-150 hover:scale-105 active:scale-95 md:bottom-6 md:right-6 md:size-16"
        aria-label="Emergency SOS"
      >
        <Shield className="size-6 md:size-7" />
      </button>

      {/* SOS overlay */}
      {open && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/60 backdrop-blur-sm md:items-center">
          <div
            className="w-full max-w-sm animate-slide-down rounded-t-3xl bg-paper p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-float md:rounded-3xl md:pb-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-10 items-center justify-center rounded-full bg-danger/10">
                  <Shield className="size-5 text-danger" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">Emergency SOS</h2>
                  <p className="text-[12px] text-ink-muted">Help is on the way</p>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelSOS}
                className="flex size-8 items-center justify-center rounded-full hover:bg-cream"
                aria-label="Cancel"
              >
                <X className="size-5 text-ink-muted" />
              </button>
            </div>

            {countdown !== null && (
              <div className="mb-5 flex flex-col items-center gap-2 rounded-2xl bg-danger-soft py-5">
                <div className="flex size-16 items-center justify-center rounded-full bg-danger text-3xl font-bold text-white">
                  {countdown}
                </div>
                <p className="text-sm font-medium text-danger">Calling 112 in {countdown}s</p>
                <button
                  type="button"
                  onClick={cancelSOS}
                  className="mt-1 rounded-xl bg-paper px-5 py-2 text-sm font-semibold text-ink shadow-control"
                >
                  Cancel
                </button>
              </div>
            )}

            {triggered && (
              <div className="mb-5 rounded-2xl bg-safe-soft p-4 text-center">
                <p className="text-sm font-semibold text-safe">Connecting to emergency services...</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {EMERGENCY_CONTACTS.map((c) => (
                <a
                  key={c.number}
                  href={`tel:${c.number}`}
                  className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 transition-colors hover:bg-cream"
                >
                  <span className="text-xl">{c.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-ink">{c.label}</p>
                    <p className="text-[12px] text-ink-muted">{c.number}</p>
                  </div>
                  <Phone className="size-4 text-brand" />
                </a>
              ))}
            </div>

            <p className="mt-4 text-center text-[11px] text-ink-muted">
              Your location will be shared with emergency services when possible.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
