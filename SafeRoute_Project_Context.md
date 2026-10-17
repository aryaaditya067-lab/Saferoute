# SafeRoute — Project Context

*Safety-aware navigation for Bengaluru: compare the fastest and the safest way to get somewhere, day and night.*

Team: [Team name] · Institution: [College name] · Event / Course: [Event or subject]

---

## 1. Project Description

SafeRoute is a web application that plans routes the way a careful local would. Regular map apps choose the quickest path; SafeRoute also looks at what is around each path: reported crimes, how bright the area is at night, whether it stays on main roads, how many shops and people are nearby, and how far police stations and hospitals are.

For every trip, SafeRoute shows three routes — **Fastest**, **Balanced** and **Safest** — and explains each one with plain facts, so the user can decide for themselves. Every fact says where it came from. When data is missing, the app says so instead of guessing.

The current version covers Bengaluru and supports driving, cycling and walking. Walking gets extra attention because it is where safety matters most, especially at night.

## 2. Problem Statement

- Navigation apps optimise for time and distance, not for personal safety.
- People walking at night cannot tell which streets are dark, deserted or near recent crimes.
- The information that would help is scattered across news reports, satellite data, open map data and people's own experience, and nobody brings it together for route planning.

## 3. Objectives

1. Offer three clearly labelled routes for every trip: Fastest, Balanced and Safest.
2. Use only real, traceable data. No invented or simulated safety data.
3. Explain why a route is considered safer, with measured facts per route.
4. Let the community report unsafe spots, with protection against misuse.
5. Give walkers extra help at night: lighting, nearby metro stations and places that are open right now.

## 4. Target Users

- Students and working professionals who walk or cycle home late.
- Women and first-time visitors who do not know the city.
- Anyone who wants a safer alternative and is willing to take a few extra minutes for it.

## 5. Key Features

| Feature | What it does |
|---|---|
| Three-route comparison | Fastest, Balanced and Safest routes for each trip, each with safety facts |
| Crime map | Soft red hotspots where reported crimes cluster; zoom in to see each report as a pin linked to its news article |
| Night view | Shows how bright each part of the city is at night using NASA satellite data |
| Community reports | Users report spots such as "poorly lit" or "harassment"; a spot counts only after 3 different people report it |
| Walking mode | Nearest metro station to the start and end with today's hours, places open right now along the route, and dark stretches marked on the map |
| Explainable ranking | "How is Safest chosen?" lists every factor and its weight for that trip |
| Animated route | The selected route draws itself from A to B with a glowing line |
| Responsive design | Works on desktop and mobile |

## 6. Data Sources (all real, no fabricated data)

| Data | Source | Notes |
|---|---|---|
| Reported crimes | GDELT news index (last 12 months) | Headlines are classified with keyword rules and placed using OpenStreetMap locality names; every incident links to its article |
| Night-time brightness | NASA Black Marble VNP46A4 (2024 annual average) | ~500 m resolution; 14,640 cells cover Bengaluru |
| Roads, street-light tags, shops, police, hospitals, metro stations, opening hours | OpenStreetMap via the Overpass API | Three Overpass servers are tried in turn, for reliability |
| Routes | OSRM (FOSSGIS public servers) | Car, bike and foot profiles |
| Place search | Photon geocoder (OpenStreetMap-based) | Search-as-you-type |
| Community reports | SafeRoute users | Confirmed after 3 different reporters |

## 7. How the "Safest" Route Is Chosen

Each candidate route is measured on these factors. A factor without data for this trip is left out, never counted as zero.

| Factor | Base weight | Measured as |
|---|---|---|
| Reported crime | 32% | Incidents whose area the route passes; closer and more recent ones count more |
| Community reports | 14% | Confirmed spots within 150 m of the route |
| Night-time darkness (NASA) | 10% | Share of the route in the city's darkest third, and how dark it is on average |
| Unlit roads (OpenStreetMap) | 8% | Share of the route on roads tagged as unlit |
| Main roads | 10% | Share of the route on main roads rather than side streets |
| Street activity | 8% | Shops, eateries and ATMs within 100 m, per km |
| Police nearby | 10% | Share of the route within 1 km of a police station |
| Hospital nearby | 8% | Share of the route within 1 km of a hospital |

- **Distance weighting:** a crime counts fully when the route passes within a third of its area radius, and less further out.
- **Recency:** a report's weight halves every 120 days.
- **Walking:** darkness counts 2.5×, unlit roads 2×, main roads 2× and street activity 1.5×. Cycling gets smaller increases.
- **Labels:** Fastest = shortest time. Safest = lowest measured risk. Balanced = the best trade-off between time and risk.

## 8. How Candidate Routes Are Generated

1. Alternatives from the routing engine (OSRM).
2. Detours on either side of the worst crime area on the fastest route.
3. **Lit corridor:** a shortest-path search over the NASA brightness grid, where dark cells cost up to six times more. The router is then asked to follow points along that corridor.
4. **Main-road route:** a graph of trunk, primary, secondary and tertiary roads from OpenStreetMap is searched for the brightest connected path, and the router is given a point on it every ~600 m.
5. **Clean-up:** out-and-back spurs caused by via points are cut out, near-duplicate routes are merged, and routes that are far too long are dropped.
6. **Limits:** walking trips up to 15 km and cycling trips up to 50 km (straight-line distance); longer trips get a clear message.

## 9. System Architecture

```
Browser (Next.js app)
   │  one API client (services/api.ts)
   ▼
Spring Boot backend (Java 21)
   ├─ Routing ─────────── OSRM (car / bike / foot)
   ├─ Street data ─────── OpenStreetMap Overpass (3 servers)
   ├─ Night lights ────── NASA Black Marble grid (CSV, loaded at startup)
   ├─ Crime ingest ────── GDELT news → keyword classifier → locality gazetteer
   ├─ Community reports ─ H2 database (salted hashes only)
   └─ Safety scorer ───── measures each route → Fastest / Balanced / Safest
```

## 10. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Leaflet |
| Backend | Java 21, Spring Boot 4, Gradle |
| Database | H2 (file-based) |
| Maps & data | OpenStreetMap, OSRM, Photon, Overpass API, GDELT, NASA Black Marble |
| Data preparation | Python (one-time conversion of the NASA file) |

## 11. Privacy and Trust

- Crime data comes from news reports, not official police records, and the app says so wherever crimes are shown.
- Community reports stay "unverified" until 3 different people report the same spot, and they expire after 60 days.
- Abuse limits: 5 reports per device per day, 20 per IP per day, one report per spot per day.
- Device IDs and IP addresses are stored only as salted hashes.
- No user accounts or personal data are required to use the app.

## 12. Current Status

- Working web app with backend and frontend for Bengaluru.
- One year of news-based crime history loaded: 388 articles checked, about 30 incidents placed on the map.
- NASA night-light data for 2024 loaded for the whole city.
- Walking features: metro stations, open-now places and dark stretches.
- Automated backend tests cover parsing, scoring, route labelling and the routing helpers.

## 13. Challenges and How We Solved Them

| Challenge | Solution |
|---|---|
| Public OpenStreetMap servers often busy | Three servers tried in order, with a time budget for each request |
| Via points made routes go down a side street and back | Spur detection and removal |
| "Safest" route sometimes passed through dark areas | Lit-corridor search on NASA data and a main-road graph router |
| Long walking trips timed out | Distance limits, background fetching and a longer client timeout |
| Few crimes in news headlines | Rule-based classifier plus reading the article text when the headline names no area |

## 14. Limitations

- News covers only crimes that get reported in the press, and locations are approximate (area level).
- Street-light tags in OpenStreetMap are sparse in Bengaluru.
- NASA data is a yearly average at ~500 m resolution; it shows which areas are bright, not individual street lamps.
- No live traffic; public routing and map servers are fair-use services.

## 15. Future Scope

- Official open crime data from police or government portals.
- Share-my-trip and SOS alerts.
- Android app (Kotlin, Jetpack Compose) with offline maps.
- Self-hosted routing and map servers for speed and reliability.
- A custom walking router that weighs lighting directly at street level.
- Support for more cities.

---

# Slide-by-Slide Outline

**Slide 1 — Title**
SafeRoute: Safety-aware navigation for Bengaluru. "Don't just get there fast. Get there safe." Team name, institution, event.

**Slide 2 — The Problem**
Map apps optimise time, not safety. Walkers at night can't see dark streets, recent crimes or how far help is. The useful data exists but is scattered.

**Slide 3 — Our Solution**
Three routes for every trip — Fastest, Balanced, Safest — each explained with real, sourced facts. Missing data is shown as missing, never guessed.

**Slide 4 — Key Features**
Crime hotspots with article links · NASA Night view · Community reports (3-person confirmation) · Walking mode (metro, open now, dark stretches) · Animated route.

**Slide 5 — Data Sources**
GDELT news (crime) · NASA Black Marble 2024 (night lights) · OpenStreetMap (roads, lights, shops, police, hospitals, metro) · OSRM (routing) · Photon (search) · Community reports.

**Slide 6 — How "Safest" Is Chosen**
The eight factors with base weights; walking multipliers; distance and recency weighting; factors without data are excluded.

**Slide 7 — Finding Safer Candidates**
Routing alternatives → crime detours → lit corridor on NASA grid → main-road graph route → spur removal and de-duplication.

**Slide 8 — Architecture & Tech Stack**
Next.js + React + Tailwind + Leaflet frontend; Java Spring Boot backend; H2 database; external open data services.

**Slide 9 — Privacy & Trust**
News ≠ police records (clearly labelled) · community confirmation and expiry · abuse limits · salted hashes only · no sign-up.

**Slide 10 — Live Demo**
Crime hotspots → Night view → walking trip with animated route → Safest route facts and dark stretches → metro card → submit a community report.

**Slide 11 — Challenges Solved**
Busy map servers, via-point spurs, dark "safe" routes, long-trip timeouts, sparse crime headlines.

**Slide 12 — Limitations**
News coverage and area-level locations · sparse street-light tags · yearly 500 m satellite data · no live traffic.

**Slide 13 — Future Scope**
Official crime data · trip sharing and SOS · Android app · self-hosted servers · street-level lighting router · more cities.

**Slide 14 — Thank You / Q&A**
