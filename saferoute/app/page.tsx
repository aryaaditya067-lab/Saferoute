"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SafeRouteApp } from "@/components/SafeRouteApp";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return null;

  return <SafeRouteApp />;
}
