"use client";

import { ArrowRight, LogIn } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

const pill =
  "group inline-flex items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_20px_-6px_rgb(232_117_36/0.55)] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-brand-strong";

/** Main call to action: log in first, or straight into the map once signed in. */
export function StartButton({ size = "lg" }: { size?: "sm" | "lg" }) {
  const { user, ready } = useAuth();
  const signedIn = ready && user !== null;
  const sizing = size === "lg" ? "h-12 px-6 text-[15px]" : "h-9 px-4 text-[14px]";
  return (
    <Link href={signedIn ? "/app" : "/login"} className={`${pill} ${sizing}`}>
      {signedIn ? (size === "lg" ? "Open SafeRoute" : "Open app") : size === "lg" ? "Log in to start" : "Log in"}
      {signedIn || size === "lg" ? (
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      ) : (
        <LogIn className="size-4" aria-hidden="true" />
      )}
    </Link>
  );
}

/** Who is signed in, shown next to the navbar button. */
export function SignedInAs() {
  const { user, ready } = useAuth();
  if (!ready || !user) return null;
  return (
    <span className="hidden items-center gap-2 text-[14px] font-medium text-ink sm:inline-flex">
      <span className="flex size-7 items-center justify-center rounded-full bg-brand text-[12px] font-bold text-white" aria-hidden="true">
        {user.name.charAt(0).toUpperCase()}
      </span>
      {user.name}
    </span>
  );
}
