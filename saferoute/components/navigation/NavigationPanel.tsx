"use client";

import { ArrowUpDown, Bike, Car, ChevronDown, Crosshair, Footprints, MapPinned, Route as RouteIcon } from "lucide-react";
import type { Ref, RefObject } from "react";
import { labelText } from "@/components/route/RouteBadges";
import { RoutePanel, type RouteState } from "@/components/route/RoutePanel";
import { IconButton } from "@/components/ui/IconButton";
import { Spinner } from "@/components/ui/Spinner";
import { formatDistance, formatDuration } from "@/lib/format";
import { TRAVEL_MODES } from "@/services/routing";
import type { Coordinates, Location, PickTarget, SavedPlaceKey, SavedPlaces, TravelMode } from "@/types";
import { LocationField } from "./LocationField";
import { QuickLocations } from "./QuickLocations";

const MODE_ICONS = { driving: Car, cycling: Bike, walking: Footprints } as const;

export interface NavigationPanelProps {
  panelRef: Ref<HTMLElement>;
  pickupInputRef: RefObject<HTMLInputElement | null>;
  destinationInputRef: RefObject<HTMLInputElement | null>;
  collapsed: boolean;
  onToggleCollapsed: () => void;

  pickup: Location | null;
  destination: Location | null;
  fieldErrors: { pickup?: string; destination?: string };
  getNear: () => Coordinates | undefined;
  onPickupSelect: (location: Location) => void;
  onDestinationSelect: (location: Location) => void;
  onPickupClear: () => void;
  onDestinationClear: () => void;
  onSwap: () => void;

  locating: boolean;
  onUseCurrentLocation: () => void;
  pickTarget: PickTarget | null;
  onTogglePick: (target: "pickup" | "destination") => void;

  savedPlaces: SavedPlaces;
  onUseSaved: (key: SavedPlaceKey) => void;
  onSetSaved: (key: SavedPlaceKey) => void;
  onManageSaved: () => void;

  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;

  routeState: RouteState;
  selectedRouteId: string | null;
  onFindRoutes: () => void;
  onSelectRoute: (id: string) => void;
  onClearRoute: () => void;
}

export function NavigationPanel(props: NavigationPanelProps) {
  const {
    panelRef,
    collapsed,
    pickup,
    destination,
    fieldErrors,
    pickTarget,
    routeState,
    mode,
    locating,
  } = props;

  const loading = routeState.status === "loading";
  const selectedRoute =
    routeState.status === "success"
      ? (routeState.response.routes.find((r) => r.id === props.selectedRouteId) ?? routeState.response.routes[0])
      : undefined;

  return (
    <aside
      ref={panelRef}
      aria-label="Trip planner"
      className="sr-panel-in sr-glass fixed inset-x-0 bottom-0 z-[1100] flex max-h-[78dvh] flex-col rounded-t-[22px] shadow-sheet md:absolute md:top-[76px] md:bottom-auto md:left-4 md:max-h-[calc(100dvh-92px)] md:w-[392px] md:rounded-[22px] md:shadow-float"
    >
      {/* Mobile sheet handle */}
      <button
        type="button"
        onClick={props.onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand trip planner" : "Collapse trip planner"}
        className="flex w-full shrink-0 items-center justify-center pt-2.5 pb-1 md:hidden"
      >
        <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
      </button>

      {collapsed && (
        <div className="px-5 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
          <button
            type="button"
            onClick={props.onToggleCollapsed}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink tabular-nums">
                {selectedRoute
                  ? `${selectedRoute.labels?.length ? `${labelText(selectedRoute.labels)} · ` : ""}${formatDuration(selectedRoute.durationSeconds)} · ${formatDistance(selectedRoute.distanceMeters)}`
                  : "Where do you want to go?"}
              </span>
              {destination && (
                <span className="block truncate text-xs text-ink-muted">
                  To {destination.name}
                  {selectedRoute?.summary ? ` · via ${selectedRoute.summary}` : ""}
                </span>
              )}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink-soft">
              Edit <ChevronDown className="size-4 rotate-180" aria-hidden="true" />
            </span>
          </button>
          {routeState.status === "success" && routeState.response.routes.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-thin" role="radiogroup" aria-label="Available routes">
              {routeState.response.routes.map((route) => {
                const active = route.id === selectedRoute?.id;
                return (
                  <button
                    key={route.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => props.onSelectRoute(route.id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium tabular-nums transition-colors ${
                      active ? "border-brand bg-brand-soft/60 text-ink" : "border-line bg-paper text-ink-soft"
                    }`}
                  >
                    {route.labels?.length ? `${labelText(route.labels)} · ` : ""}
                    {formatDuration(route.durationSeconds)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        className={`sr-stagger flex-col gap-5 overflow-y-auto overscroll-contain px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] scrollbar-thin md:flex md:p-6 ${
          collapsed ? "hidden" : "flex"
        }`}
      >
        <div>
          <h1 className="sr-display text-[24px] leading-[1.1] font-semibold text-ink md:text-[28px]">Where do you want to go?</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">Compare the fastest and the safest way there.</p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="rounded-[14px] bg-[rgb(118_118_128/0.1)] transition-[background-color,box-shadow] duration-200 focus-within:bg-paper focus-within:shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_4px_16px_rgb(0_0_0/0.08)]">
          <LocationField
            embedded
            label="Pickup"
            placeholder="Current location"
            marker="pickup"
            value={pickup}
            error={fieldErrors.pickup}
            getNear={props.getNear}
            onSelect={props.onPickupSelect}
            onClear={props.onPickupClear}
            inputRef={props.pickupInputRef}
            actions={
              <>
                <IconButton
                  label="Use my current location"
                  onClick={props.onUseCurrentLocation}
                  disabled={locating}
                  className={pickup?.source === "geolocation" ? "text-locate" : ""}
                >
                  {locating ? <Spinner className="size-[18px] text-locate" /> : <Crosshair className="size-[18px]" aria-hidden="true" />}
                </IconButton>
                <IconButton
                  label={pickTarget?.kind === "pickup" ? "Cancel choosing pickup on map" : "Choose pickup on map"}
                  active={pickTarget?.kind === "pickup"}
                  aria-pressed={pickTarget?.kind === "pickup"}
                  onClick={() => props.onTogglePick("pickup")}
                >
                  <MapPinned className="size-[18px]" aria-hidden="true" />
                </IconButton>
              </>
            }
          />
          <div className="relative mr-3 ml-11 border-t border-dashed border-line-strong/80" aria-hidden="true">
            <span className="absolute top-1/2 -left-[25px] flex -translate-y-1/2 flex-col gap-[3px]">
              <span className="size-[3px] rounded-full bg-ink-muted/70" />
              <span className="size-[3px] rounded-full bg-ink-muted/70" />
              <span className="size-[3px] rounded-full bg-ink-muted/70" />
            </span>
          </div>
          <LocationField
            embedded
            label="Destination"
            placeholder="Search destination"
            marker="destination"
            value={destination}
            error={fieldErrors.destination}
            getNear={props.getNear}
            onSelect={props.onDestinationSelect}
            onClear={props.onDestinationClear}
            inputRef={props.destinationInputRef}
            actions={
              <>
                <IconButton
                  label="Swap pickup and destination"
                  onClick={props.onSwap}
                  disabled={!pickup && !destination}
                >
                  <ArrowUpDown className="size-[18px]" aria-hidden="true" />
                </IconButton>
                <IconButton
                  label={pickTarget?.kind === "destination" ? "Cancel choosing destination on map" : "Choose destination on map"}
                  active={pickTarget?.kind === "destination"}
                  aria-pressed={pickTarget?.kind === "destination"}
                  onClick={() => props.onTogglePick("destination")}
                >
                  <MapPinned className="size-[18px]" aria-hidden="true" />
                </IconButton>
              </>
            }
          />
          </div>
          <p className="px-1 text-[13px] text-ink-muted">
            Tip: <span className="hidden md:inline">right-click</span>
            <span className="md:hidden">long-press</span> the map to drop a pin.
          </p>
        </div>

        <QuickLocations
          savedPlaces={props.savedPlaces}
          onUse={props.onUseSaved}
          onSet={props.onSetSaved}
          onManage={props.onManageSaved}
        />

        <div role="radiogroup" aria-label="Travel mode" className="grid grid-cols-3 rounded-[10px] bg-[rgb(118_118_128/0.12)] p-[2px]">
          {TRAVEL_MODES.map((option) => {
            const Icon = MODE_ICONS[option.id];
            const active = option.id === mode;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => props.onModeChange(option.id)}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-semibold transition-all duration-200 ${
                  active ? "bg-paper text-ink shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]" : "text-ink-soft hover:text-ink"
                }`}
              >
                <Icon className={`size-4 ${active ? "text-brand" : ""}`} aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={props.onFindRoutes}
          disabled={loading}
          className="inline-flex h-[50px] w-full shrink-0 items-center justify-center gap-2 rounded-[14px] bg-brand text-[17px] font-semibold text-white transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
        >
          {loading ? <Spinner className="size-[18px]" /> : <RouteIcon className="size-[18px]" aria-hidden="true" />}
          {loading ? "Finding routes…" : "Find Safer Routes"}
        </button>

        <RoutePanel
          state={routeState}
          selectedRouteId={props.selectedRouteId}
          onSelect={props.onSelectRoute}
          onRetry={props.onFindRoutes}
          onClear={props.onClearRoute}
        />
      </div>
    </aside>
  );
}
