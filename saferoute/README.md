# SafeRoute

SafeRoute is a navigation web app that ranks routes by safety. On its own, the app is a full navigation app built on OpenStreetMap services. With the Java backend in `../saferoute-backend` running, it adds:

- **Reported crimes on the map:** red areas with a 💬 marker. Each marker opens the crime type, locality, date, the quoted sentence and links to its news sources.
- **Fastest / Balanced / Safest routes:** each route lists what was measured (reported-crime areas, lit roads, nearby police stations and hospitals), plus a "How is 'Safest' chosen?" note that names the factors and weights used.

Turn these on by putting `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` in `.env.local`. See `../saferoute-backend/README.md` for how the backend works. Without the backend, the app shows no crime layer and no safety labels, because it never shows invented data.

## What works

- **Map**: an interactive Leaflet map with OpenStreetMap tiles and proper attribution. It remembers your last view in this browser.
- **Current location**: uses the browser Geolocation API. It shows a live position dot with an accuracy circle and sets it as your pickup. It handles denied permission, unavailable position, timeouts, unsupported browsers and non-HTTPS pages. If you already granted permission, it locates you on load without asking again.
- **Place search**: debounced (400 ms, at least 3 characters) and cancellable. Results are ranked near you or near the map view, and you can pick them with the keyboard. It shows loading, empty, error and rate-limit states.
- **Choosing on the map**: the pin button next to a field lets you click or tap the map. Right-clicking (desktop) or long-pressing (touch) drops a pin you can set as pickup or destination. You can drag either marker to adjust it. Pins get a readable "Near …" address from reverse geocoding.
- **Saved places**: Home, Work and College are saved in this browser (`localStorage`). They start empty. Tapping one that isn't set shows *"Home location isn't set yet."* along with a way to set it (search, current location, choose on map, or reuse the pickup or destination).
- **Routing**: OSRM on OpenStreetMap data, for Drive, Bike and Walk. It returns real geometry, distance and duration, plus alternative routes when OSRM offers them. The map fits to the route, and you can select a route from the list or the map.
- **Errors**: covers being offline, timeouts, HTTP 429, no route, a point too far from any road, invalid or identical locations, and missing pickup or destination.
- **Mobile**: the map fills the screen and the trip planner is a bottom sheet. The sheet lowers after routing so the route is visible, and you can switch routes from chips.

## Pages

- `/`: the navigation app, which opens straight into the map.
- `/about`: the SafeRoute website (features, how it works, roadmap, privacy, FAQ). It links to the app, and the app header links back to it with the ⓘ button.

## Run it

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build`, `npm start`, `npm run lint`, `npm run typecheck`.

Browsers only allow geolocation on `https://` or `localhost`.

## Providers and usage policies

| Purpose | Provider | Notes |
|---|---|---|
| Map tiles | `tile.openstreetmap.org` | [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/). Use your own or a commercial tile server before heavy production traffic (`NEXT_PUBLIC_TILE_URL`). |
| Search and reverse geocoding | [Photon](https://photon.komoot.io) (OSM data) | Built for search-as-you-type. **Nominatim's public server forbids client-side autocomplete**, which is why Photon is used. The client spaces requests, caches results, cancels stale requests and backs off after a 429. |
| Routing | [FOSSGIS OSRM](https://routing.openstreetmap.de/about.html) (car, bike and foot) | Requests are limited to at most 1 per second and identical requests are cached. Durations don't include live traffic. |

All three public services are fair-use. For production traffic, route requests through the backend (see below) or self-host the providers.

## Architecture

```
app/                    Next.js App Router entry (layout, page, global styles)
components/
  SafeRouteApp.tsx      App state: pickup, destination, routes, geolocation, pick mode
  map/                  Leaflet map (client-only, created once, cleaned up on unmount), marker icons
  navigation/           Trip card, search field (combobox), saved places, saved-place dialog
  route/                Route results list
  site/                 Landing page pieces (decorative hero preview)
  ui/                   Logo, icon button, spinner, notices
services/
  api.ts                The ONLY place that talks to the SafeRoute backend
  geocoding.ts          searchPlaces(), reverseGeocode()
  routing.ts            getRoutes()
  location.ts           Browser geolocation wrapper
types/                  Location, Route, RouteRequest, RouteResponse, …
lib/                    fetch wrapper (timeouts and errors), request gate, formatting, storage, hooks
```

React components never call external APIs directly. They only use `services/*`.

## Moving to the Java Spring Boot backend

Set `NEXT_PUBLIC_API_BASE_URL` (for example `http://localhost:8080`). The geocoding and routing services will then call the backend instead of the public providers, and the UI needs no changes. The backend must implement:

```
GET  /api/v1/geocode/search?q=&limit=&lat=&lng=   -> Location[]
GET  /api/v1/geocode/reverse?lat=&lng=            -> Location | null
POST /api/v1/routes                               -> RouteResponse
     { pickup: {lat,lng}, destination: {lat,lng}, mode: "driving"|"cycling"|"walking", alternatives: true }
```

The shapes are defined in `types/index.ts`. `RouteResponse.routes` is already a list, and the UI already renders and switches between multiple routes. When the safety engine exists, it can add fields to `Route`, and the route list can show them:

```
Next.js  →  Java Spring Boot  →  routing providers  →  safety engine
```

The backend also needs to allow CORS from the frontend origin.
