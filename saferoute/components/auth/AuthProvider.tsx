"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { AuthContext, loadUser, persistUser, type AuthUser } from "@/lib/auth";

const emptySubscribe = () => () => {};

export function AuthProvider({ children }: { children: ReactNode }) {
  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    return loadUser();
  });

  const ready = isClient;

  const login = useCallback((u: AuthUser) => {
    persistUser(u);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    persistUser(null);
    setUser(null);
  }, []);

  return (
    <AuthContext value={{ user, ready, login, logout }}>
      {children}
    </AuthContext>
  );
}
