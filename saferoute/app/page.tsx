"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SafeRouteApp } from "@/components/SafeRouteApp";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
    } else {
      setAllowed(true);
    }
  }, [ready, user, router]);

  if (!allowed) return null;

  return <SafeRouteApp />;
}
