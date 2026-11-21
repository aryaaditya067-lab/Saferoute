"use client";

import { createContext, useContext } from "react";

export type UserRole = "user" | "government";

export interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  ready: false,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

const STORAGE_KEY = "saferoute_user";

export function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function persistUser(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked.
  }
}
