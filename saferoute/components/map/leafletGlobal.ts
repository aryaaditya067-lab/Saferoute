import L from "leaflet";

// leaflet.markercluster and leaflet.heat attach themselves to the global `L`, which
// Leaflet's ES-module build does not set. Import this before those plugins.
(globalThis as unknown as { L: typeof L }).L = L;
