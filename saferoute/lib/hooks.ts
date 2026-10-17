"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { describeError, isAbortError } from "@/lib/errors";
import { MIN_QUERY_LENGTH, searchPlaces } from "@/services/geocoding";
import type { Coordinates, Location, MapInsets } from "@/types";

// ---- Online status ---------------------------------------------------------

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

// ---- Debounced place search ------------------------------------------------

export type SearchStatus = "idle" | "loading" | "success" | "error";

interface SearchState {
  query: string;
  status: SearchStatus;
  results: Location[];
  error: string | null;
}

const IDLE: SearchState = { query: "", status: "idle", results: [], error: null };
const DEBOUNCE_MS = 400;

/**
 * Debounced, cancellable place search. Only the latest query's results are
 * ever applied; superseded requests are aborted.
 */
export function usePlaceSearch(getNear: () => Coordinates | undefined) {
  const [state, setState] = useState<SearchState>(IDLE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const getNearRef = useRef(getNear);

  useEffect(() => {
    getNearRef.current = getNear;
  }, [getNear]);

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const run = useCallback((query: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ query, status: "loading", results: [], error: null });
    searchPlaces(query, { signal: current.signal, near: getNearRef.current() })
      .then((results) => {
        if (current.signal.aborted) return;
        setState({ query, status: "success", results, error: null });
      })
      .catch((error: unknown) => {
        if (current.signal.aborted || isAbortError(error)) return;
        setState({ query, status: "error", results: [], error: describeError(error, "search") });
      });
  }, []);

  const search = useCallback(
    (raw: string) => {
      cancelPending();
      const query = raw.trim();
      if (query.length < MIN_QUERY_LENGTH) {
        setState({ ...IDLE, query });
        return;
      }
      setState((prev) => ({ ...prev, query, status: "loading", error: null }));
      timer.current = setTimeout(() => run(query), DEBOUNCE_MS);
    },
    [cancelPending, run],
  );

  const retry = useCallback(() => {
    if (state.query.length >= MIN_QUERY_LENGTH) run(state.query);
  }, [run, state.query]);

  const reset = useCallback(() => {
    cancelPending();
    setState(IDLE);
  }, [cancelPending]);

  useEffect(() => cancelPending, [cancelPending]);

  return { ...state, search, retry, reset };
}

// ---- Overlay insets ----------------------------------------------------------

const ZERO_INSETS: MapInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Measures how much of the map is covered by the floating panel so the map
 * can centre content in the visible area. On wide screens the panel sits on
 * the left; on phones it is a bottom sheet.
 */
export function useOverlayInsets(panelRef: RefObject<HTMLElement | null>, headerRef: RefObject<HTMLElement | null>) {
  const [insets, setInsets] = useState<MapInsets>(ZERO_INSETS);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const measure = () => {
      const rect = panel.getBoundingClientRect();
      const header = headerRef.current?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isBottomSheet = rect.width > vw * 0.85;
      const next: MapInsets = isBottomSheet
        ? { top: header ? header.bottom : 0, right: 0, bottom: Math.max(0, vh - rect.top), left: 0 }
        : { top: 0, right: 0, bottom: 0, left: Math.max(0, rect.right) };
      setInsets((prev) =>
        prev.top === next.top && prev.right === next.right && prev.bottom === next.bottom && prev.left === next.left
          ? prev
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [panelRef, headerRef]);

  return insets;
}
