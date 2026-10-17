"use client";

import { Info, MapPinned, MessageSquarePlus, WifiOff, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ReportDialog } from "@/components/community/ReportDialog";
import { CrimeLayerToggle } from "@/components/map/CrimeLayerToggle";
import { LayerToggle } from "@/components/map/LayerToggle";
import { NightViewToggle } from "@/components/map/NightViewToggle";
import type { MapFocus, PinKind } from "@/components/map/MapView";
import { NavigationPanel } from "@/components/navigation/NavigationPanel";
import { SavedPlacesDialog, savedPlaceSubtitle } from "@/components/navigation/SavedPlacesDialog";
import type { RouteState } from "@/components/route/RoutePanel";
import { LogoMark } from "@/components/ui/Logo";
import { NoticeToast, useNotices } from "@/components/ui/Notices";
import { describeError, isAbortError, serverMessage } from "@/lib/errors";
import { createId, formatCoordinates } from "@/lib/geo";
import { useOnlineStatus, useOverlayInsets } from "@/lib/hooks";
import { useCommunitySpots } from "@/lib/useCommunitySpots";
import { useIncidents } from "@/lib/useIncidents";
import { useNightLights } from "@/lib/useNightLights";
import {
  getSavedPlacesServerSnapshot,
  getSavedPlacesSnapshot,
  removePlace,
  SAVED_PLACE_LABELS,
  savePlace,
  subscribeSavedPlaces,
} from "@/lib/savedPlaces";
import { describeNearby, reverseGeocode } from "@/services/geocoding";
import { getCurrentPosition, getLocationPermission } from "@/services/location";
import { getRoutes } from "@/services/routing";
import type { Coordinates, GeoPosition, Location, MapBounds, PickTarget, SavedPlaceKey, TravelMode } from "@/types";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-cream-deep text-sm text-ink-muted">
      Loading map…
    </div>
  ),
});

type FieldErrors = { pickup?: string; destination?: string };

function pinLocation(point: Coordinates, source: "map" | "geolocation", accuracyMeters?: number): Location {
  return {
    id: createId(source),
    name: source === "geolocation" ? "Current location" : "Dropped pin",
    address: formatCoordinates(point),
    lat: point.lat,
    lng: point.lng,
    source,
    accuracyMeters,
  };
}

export function SafeRouteApp() {
  const [pickup, setPickup] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [mode, setMode] = useState<TravelMode>("driving");
  const [routeState, setRouteState] = useState<RouteState>({ status: "idle" });
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<GeoPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [pickTarget, setPickTarget] = useState<PickTarget | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [savedDialog, setSavedDialog] = useState<{ initialKey: SavedPlaceKey | null } | null>(null);

  const { notices, notify, dismiss } = useNotices();
  const crimeLayer = useIncidents();
  const [showCrimes, setShowCrimes] = useState(true);
  const communityLayer = useCommunitySpots();
  const [showCommunity, setShowCommunity] = useState(true);
  const nightLayer = useNightLights();
  const [reportAt, setReportAt] = useState<{ point: Coordinates; label: string | null } | null>(null);
  const online = useOnlineStatus();
  const savedPlaces = useSyncExternalStore(subscribeSavedPlaces, getSavedPlacesSnapshot, getSavedPlacesServerSnapshot);

  const panelRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const pickupInputRef = useRef<HTMLInputElement>(null);
  const destinationInputRef = useRef<HTMLInputElement>(null);
  const insets = useOverlayInsets(panelRef, headerRef);

  const routeController = useRef<AbortController | null>(null);
  const focusSeq = useRef(0);
  const mapCenter = useRef<Coordinates | undefined>(undefined);
  const userPositionRef = useRef<GeoPosition | null>(null);
  const locatingRef = useRef(false);

  // Search results are ranked near the user (if known) or the visible map area.
  const getNear = useCallback((): Coordinates | undefined => userPositionRef.current ?? mapCenter.current, []);
  const onIncidentView = crimeLayer.onViewChange;
  const onCommunityView = communityLayer.onViewChange;
  const handleViewChange = useCallback((view: { center: Coordinates; bounds: MapBounds; zoom: number }) => {
    mapCenter.current = view.center;
    onIncidentView(view.bounds, view.zoom);
    onCommunityView(view.bounds, view.zoom);
  }, [onIncidentView, onCommunityView]);

  const focusPoint = useCallback((point: Coordinates, zoom?: number) => {
    setFocus({ id: ++focusSeq.current, type: "point", point, zoom });
  }, []);

  // ---- Route lifecycle -------------------------------------------------------

  const clearRoute = useCallback(() => {
    routeController.current?.abort();
    routeController.current = null;
    setRouteState({ status: "idle" });
    setSelectedRouteId(null);
  }, []);

  const computeRoutes = useCallback(
    async (from: Location | null, to: Location | null, travelMode: TravelMode) => {
      const errors: FieldErrors = {};
      if (!from) errors.pickup = "Add a pickup location — use your location, search, or choose on the map.";
      if (!to) errors.destination = "Add a destination to get directions.";
      if (!from || !to) {
        setFieldErrors(errors);
        setSheetCollapsed(false);
        (from ? destinationInputRef : pickupInputRef).current?.focus();
        return;
      }
      setFieldErrors({});

      routeController.current?.abort();
      const controller = new AbortController();
      routeController.current = controller;
      setRouteState({ status: "loading" });
      setSelectedRouteId(null);

      try {
        const response = await getRoutes(
          { pickup: from, destination: to, mode: travelMode, alternatives: true },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setRouteState({ status: "success", response });
        // SafeRoute opens on the safest route when the backend ranked them.
        const safest = response.routes.find((r) => r.labels?.includes("safest"));
        setSelectedRouteId((safest ?? response.routes[0])?.id ?? null);
        // On phones, lower the sheet first so the route is fitted into the visible map area.
        if (window.matchMedia("(max-width: 767px)").matches) {
          setSheetCollapsed(true);
          setTimeout(() => setFocus({ id: ++focusSeq.current, type: "routes" }), 80);
        } else {
          setFocus({ id: ++focusSeq.current, type: "routes" });
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        setRouteState({ status: "error", message: serverMessage(error) ?? describeError(error, "routing") });
      } finally {
        if (routeController.current === controller) routeController.current = null;
      }
    },
    [],
  );

  useEffect(() => () => routeController.current?.abort(), []);

  // ---- Pickup / destination updates ------------------------------------------

  const updatePickup = useCallback(
    (location: Location | null, options: { focus?: boolean } = {}) => {
      clearRoute();
      setPickup(location);
      setFieldErrors((e) => ({ ...e, pickup: undefined }));
      if (location && options.focus) focusPoint(location);
    },
    [clearRoute, focusPoint],
  );

  const updateDestination = useCallback(
    (location: Location | null, options: { focus?: boolean } = {}) => {
      clearRoute();
      setDestination(location);
      setFieldErrors((e) => ({ ...e, destination: undefined }));
      if (location && options.focus) focusPoint(location);
    },
    [clearRoute, focusPoint],
  );

  /** Fills in a readable address for a pin once the reverse geocoder answers. */
  const resolvePinAddress = useCallback((kind: PinKind, location: Location) => {
    reverseGeocode(location)
      .then((place) => {
        const nearby = describeNearby(place);
        if (!nearby) return;
        const apply = (prev: Location | null) => (prev?.id === location.id ? { ...prev, address: nearby } : prev);
        if (kind === "pickup") setPickup(apply);
        else setDestination(apply);
      })
      .catch(() => {
        // Coordinates remain as the address; the pin itself is still valid.
      });
  }, []);

  const setPin = useCallback(
    (kind: PinKind, point: Coordinates) => {
      const location = pinLocation(point, "map");
      if (kind === "pickup") updatePickup(location);
      else updateDestination(location);
      resolvePinAddress(kind, location);
    },
    [resolvePinAddress, updateDestination, updatePickup],
  );

  // ---- Geolocation -------------------------------------------------------------

  const locate = useCallback(async (): Promise<GeoPosition | null> => {
    if (locatingRef.current) return null;
    locatingRef.current = true;
    setLocating(true);
    try {
      const position = await getCurrentPosition();
      userPositionRef.current = position;
      setUserPosition(position);
      return position;
    } catch (error) {
      notify(describeError(error, "location"), "error");
      return null;
    } finally {
      locatingRef.current = false;
      setLocating(false);
    }
  }, [notify]);

  const setPickupToCurrentLocation = useCallback(async () => {
    const position = await locate();
    if (!position) return;
    const location = pinLocation(position, "geolocation", position.accuracyMeters);
    updatePickup(location);
    focusPoint(position, 16);
    resolvePinAddress("pickup", location);
  }, [focusPoint, locate, resolvePinAddress, updatePickup]);

  const handleLocateButton = useCallback(async () => {
    const position = await locate();
    if (!position) return;
    focusPoint(position, 16);
    // Fill an empty pickup with the detected position.
    if (!pickup) {
      const location = pinLocation(position, "geolocation", position.accuracyMeters);
      updatePickup(location);
      resolvePinAddress("pickup", location);
    }
  }, [focusPoint, locate, pickup, resolvePinAddress, updatePickup]);

  // If location permission was already granted earlier, use it without prompting.
  useEffect(() => {
    let cancelled = false;
    getLocationPermission().then(async (state) => {
      if (cancelled || state !== "granted") return;
      const position = await locate();
      if (cancelled || !position) return;
      const location = pinLocation(position, "geolocation", position.accuracyMeters);
      // Only fill the pickup if the user hasn't set one in the meantime.
      setPickup((prev) => prev ?? location);
      focusPoint(position, 15);
      resolvePinAddress("pickup", location);
    });
    return () => {
      cancelled = true;
    };
  }, [focusPoint, locate, resolvePinAddress]);

  // ---- Map picking -----------------------------------------------------------

  const startPick = useCallback((target: PickTarget) => {
    setPickTarget(target);
    setSheetCollapsed(true);
  }, []);

  const cancelPick = useCallback(() => {
    setPickTarget(null);
    setSheetCollapsed(false);
  }, []);

  useEffect(() => {
    if (!pickTarget) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelPick();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pickTarget, cancelPick]);

  const saveSavedPlace = useCallback(
    (key: SavedPlaceKey, location: Location) => {
      if (savePlace(key, location)) notify(`${SAVED_PLACE_LABELS[key]} saved.`, "success");
      else notify("Couldn't save — this browser is blocking local storage.", "error");
    },
    [notify],
  );

  /** Opens the report dialog for a point and fills in a readable place name when available. */
  const openReport = useCallback((point: Coordinates) => {
    setReportAt({ point, label: null });
    reverseGeocode(point)
      .then((place) => {
        const label = describeNearby(place);
        if (label) setReportAt((prev) => (prev && prev.point === point ? { ...prev, label } : prev));
      })
      .catch(() => {
        // Coordinates are shown instead.
      });
  }, []);

  const handlePick = useCallback(
    async (target: PickTarget, point: Coordinates) => {
      setPickTarget(null);
      setSheetCollapsed(false);
      if (target.kind === "saved") {
        const base = pinLocation(point, "map");
        let place: Location | null = null;
        try {
          place = await reverseGeocode(point);
        } catch {
          // Save with coordinates only.
        }
        saveSavedPlace(target.key, { ...base, address: describeNearby(place) ?? base.address });
        return;
      }
      if (target.kind === "report") {
        openReport(point);
        return;
      }
      setPin(target.kind, point);
    },
    [saveSavedPlace, setPin, openReport],
  );

  // ---- Saved places --------------------------------------------------------------

  const applySavedPlace = useCallback(
    (key: SavedPlaceKey) => {
      const saved = getSavedPlacesSnapshot()[key];
      if (!saved) return;
      updateDestination(
        {
          ...saved.location,
          id: `saved:${key}:${saved.savedAt}`,
          name: SAVED_PLACE_LABELS[key],
          address: savedPlaceSubtitle(saved.location),
          source: "saved",
        },
        { focus: true },
      );
    },
    [updateDestination],
  );

  const saveCurrentLocationAs = useCallback(
    async (key: SavedPlaceKey): Promise<boolean> => {
      const position = await locate();
      if (!position) return false;
      const base = pinLocation(position, "map");
      let place: Location | null = null;
      try {
        place = await reverseGeocode(position);
      } catch {
        // Keep coordinates as the address.
      }
      saveSavedPlace(key, { ...base, address: describeNearby(place) ?? base.address });
      return true;
    },
    [locate, saveSavedPlace],
  );

  // ---- Travel mode -----------------------------------------------------------------

  const changeMode = useCallback(
    (next: TravelMode) => {
      setMode(next);
      // Recalculate automatically if the user already asked for routes.
      if (routeState.status !== "idle" && pickup && destination) {
        void computeRoutes(pickup, destination, next);
      }
    },
    [computeRoutes, destination, pickup, routeState.status],
  );

  const swap = useCallback(() => {
    clearRoute();
    setPickup(destination);
    setDestination(pickup);
    setFieldErrors({});
  }, [clearRoute, destination, pickup]);

  const routes = routeState.status === "success" ? routeState.response.routes : null;
  const pickLabel =
    pickTarget?.kind === "pickup"
      ? "pickup"
      : pickTarget?.kind === "destination"
        ? "destination"
        : pickTarget?.kind === "saved"
          ? SAVED_PLACE_LABELS[pickTarget.key]
          : pickTarget?.kind === "report"
            ? "where the issue is"
            : "";

  return (
    <main className="relative h-dvh w-full overflow-hidden overscroll-none bg-cream">
      <MapView
        pickup={pickup}
        destination={destination}
        userPosition={userPosition}
        routes={routes}
        selectedRouteId={selectedRouteId}
        pickTarget={pickTarget}
        focus={focus}
        insets={insets}
        locating={locating}
        incidents={showCrimes ? crimeLayer.incidents : []}
        communitySpots={showCommunity ? communityLayer.spots : []}
        communityConfirmThreshold={communityLayer.confirmThreshold ?? 3}
        nightLights={nightLayer.visible ? nightLayer.data : null}
        stations={routeState.status === "success" ? (routeState.response.transit?.stations ?? undefined) : undefined}
        onReportAt={communityLayer.enabled ? openReport : undefined}
        onSelectRoute={setSelectedRouteId}
        onPick={handlePick}
        onDropPin={setPin}
        onLocate={handleLocateButton}
        onViewChange={handleViewChange}
      />

      <header
        ref={headerRef}
        className="pointer-events-none fixed top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-[1100] md:top-4 md:left-4"
      >
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl border border-line bg-paper/95 py-1.5 pr-3.5 pl-1.5 shadow-float backdrop-blur">
          <LogoMark size={30} />
          <span className="text-[15px] font-semibold tracking-tight text-ink">SafeRoute</span>
          <Link
            href="/about"
            aria-label="About SafeRoute"
            title="About SafeRoute"
            className="-mr-2 ml-0.5 inline-flex size-7 items-center justify-center rounded-lg text-ink-muted hover:bg-cream-deep hover:text-ink"
          >
            <Info className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {crimeLayer.enabled && (
        <div className="pointer-events-none fixed top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-[1100] flex w-[min(17.5rem,calc(100vw-1.5rem))] flex-col items-stretch gap-2 md:top-4 md:right-4 md:w-72">
          <section
            aria-label="Map layers"
            className="pointer-events-auto rounded-2xl border border-line bg-paper/95 p-1.5 shadow-float backdrop-blur"
          >
            <h2 className="px-2.5 pt-1 pb-0.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Map layers</h2>
            <CrimeLayerToggle
              layer={crimeLayer}
              visible={showCrimes}
              onToggle={() => setShowCrimes((v) => !v)}
              onRetry={crimeLayer.retry}
            />
            {communityLayer.enabled && (
              <LayerToggle
                label="Community reports"
                shortLabel="Community"
                dotClass="bg-[#7c3aed]"
                status={communityLayer.status}
                count={communityLayer.spots.length}
                title={communityLayer.note ?? "Community reports"}
                error={communityLayer.error}
                visible={showCommunity}
                onToggle={() => setShowCommunity((v) => !v)}
                onRetry={communityLayer.refresh}
              />
            )}
            {nightLayer.enabled && <NightViewToggle layer={nightLayer} />}
          </section>
          {communityLayer.enabled && (
            <button
              type="button"
              onClick={() => (pickTarget?.kind === "report" ? cancelPick() : startPick({ kind: "report" }))}
              className="pointer-events-auto inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#7c3aed] px-3.5 text-sm font-semibold text-white shadow-float hover:bg-[#6d28d9]"
            >
              <MessageSquarePlus className="size-4" aria-hidden="true" />
              {pickTarget?.kind === "report" ? "Cancel report" : "Report a safety issue"}
            </button>
          )}
        </div>
      )}

      <div
        className="pointer-events-none fixed inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+250px)] z-[1200] flex flex-col items-center gap-2 md:top-4 md:right-[312px] md:left-[432px]"
        aria-live="polite"
      >
        {!online && (
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-2xl bg-ink px-3.5 py-2.5 text-sm text-paper shadow-float">
            <WifiOff className="size-4 shrink-0" aria-hidden="true" />
            You&apos;re offline. Search, routing and new map areas need a connection.
          </div>
        )}
        {pickTarget && (
          <div className="pointer-events-auto flex w-full max-w-md animate-slide-down items-center gap-2.5 rounded-2xl border border-brand/40 bg-paper py-2 pr-2 pl-3.5 text-sm text-ink shadow-float">
            <MapPinned className="size-4 shrink-0 text-brand" aria-hidden="true" />
            <p className="flex-1">
              <span className="hidden md:inline">Click</span>
              <span className="md:hidden">Tap</span> the map to set {pickLabel}.
            </p>
            <button
              type="button"
              onClick={cancelPick}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-ink-soft hover:bg-cream hover:text-ink"
            >
              <X className="size-3.5" aria-hidden="true" /> Cancel
            </button>
          </div>
        )}
        {notices.map((notice) => (
          <NoticeToast key={notice.id} notice={notice} onDismiss={dismiss} />
        ))}
      </div>

      <NavigationPanel
        panelRef={panelRef}
        pickupInputRef={pickupInputRef}
        destinationInputRef={destinationInputRef}
        collapsed={sheetCollapsed}
        onToggleCollapsed={() => setSheetCollapsed((c) => !c)}
        pickup={pickup}
        destination={destination}
        fieldErrors={fieldErrors}
        getNear={getNear}
        onPickupSelect={(location) => updatePickup(location, { focus: true })}
        onDestinationSelect={(location) => updateDestination(location, { focus: true })}
        onPickupClear={() => updatePickup(null)}
        onDestinationClear={() => updateDestination(null)}
        onSwap={swap}
        locating={locating}
        onUseCurrentLocation={setPickupToCurrentLocation}
        pickTarget={pickTarget}
        onTogglePick={(kind) => (pickTarget?.kind === kind ? cancelPick() : startPick({ kind }))}
        savedPlaces={savedPlaces}
        onUseSaved={applySavedPlace}
        onSetSaved={(key) => setSavedDialog({ initialKey: key })}
        onManageSaved={() => setSavedDialog({ initialKey: null })}
        mode={mode}
        onModeChange={changeMode}
        routeState={routeState}
        selectedRouteId={selectedRouteId}
        onFindRoutes={() => void computeRoutes(pickup, destination, mode)}
        onSelectRoute={setSelectedRouteId}
        onClearRoute={clearRoute}
      />

      {reportAt && (
        <ReportDialog
          point={reportAt.point}
          placeLabel={reportAt.label}
          confirmThreshold={communityLayer.confirmThreshold ?? 3}
          onClose={() => setReportAt(null)}
          onSubmitted={(spot) => {
            setReportAt(null);
            setShowCommunity(true);
            communityLayer.refresh();
            notify(
              spot.confirmed
                ? `Thanks. ${spot.reporters} people have reported this spot, so routes now take it into account.`
                : `Thanks, report added. It affects routes once ${communityLayer.confirmThreshold ?? 3} different people report it.`,
              "success",
            );
          }}
        />
      )}

      {savedDialog && (
        <SavedPlacesDialog
          savedPlaces={savedPlaces}
          initialKey={savedDialog.initialKey}
          pickup={pickup}
          destination={destination}
          getNear={getNear}
          onClose={() => setSavedDialog(null)}
          onSave={(key, location) => {
            saveSavedPlace(key, location);
            if (savedDialog.initialKey) setSavedDialog(null);
          }}
          onRemove={(key) => {
            if (removePlace(key)) notify(`${SAVED_PLACE_LABELS[key]} removed.`, "info");
            else notify("Couldn't update saved places in this browser.", "error");
          }}
          onPickOnMap={(key) => {
            setSavedDialog(null);
            startPick({ kind: "saved", key });
          }}
          onUseCurrentLocation={async (key) => {
            const ok = await saveCurrentLocationAs(key);
            if (ok && savedDialog.initialKey) setSavedDialog(null);
            return ok;
          }}
        />
      )}
    </main>
  );
}
