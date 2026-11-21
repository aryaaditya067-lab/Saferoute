"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AuthContext, loadUser, persistUser, type AuthUser } from "@/lib/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(loadUser());
    setReady(true);
  }, []);

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
