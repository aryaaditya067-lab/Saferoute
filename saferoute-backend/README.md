# SafeRoute backend (Java Spring Boot)

This is the server behind SafeRoute's safety features. It does three things:

1. **Collects reported crimes.** It uses MiMo web search to find recent crime news and checks each report against its article. Reports that pass are stored with an approximate location.
2. **Ranks routes.** It builds candidate routes, measures each one, and labels them **Fastest**, **Balanced** and **Safest**.
3. **Proxies search and routing** for the Next.js app (`../saferoute`). That way the browser only talks to this server.

## Run it (Windows PowerShell)

You need **Java 21**. Android Studio ships one (its `jbr` folder), and Gradle downloads one automatically if it's missing.

```powershell
cd saferoute-backend
$env:MIMO_API_KEY = "<your MiMo key>"                 # never commit this
$env:SAFEROUTE_ADMIN_TOKEN = "<any long random text>"  # protects the manual ingest endpoint
$env:SAFEROUTE_CONTACT_EMAIL = "<your email>"          # sent in the User-Agent to public OSM services
.\gradlew.bat bootRun
```

The server runs at http://localhost:8080.

- **Status:** http://localhost:8080/api/v1/status
- **Collecting reports:** the first run starts 30 seconds after the server starts, then repeats every 3 hours. To run one now:
  ```powershell
  Invoke-RestMethod -Method Post http://localhost:8080/api/v1/admin/ingest -Headers @{ "X-Admin-Token" = $env:SAFEROUTE_ADMIN_TOKEN }
  ```
  The response shows how many pages the search found (`pagesFound`), a preview of MiMo's reply, and how many reports were accepted, merged or rejected, with the reason for each rejection.
- **Turning it on in the frontend:** in `../saferoute`, create `.env.local` containing `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`, then restart `npm run dev`.

Data is stored in `./data/` as an H2 database file. There is nothing to install. Delete the folder to start fresh.

**MiMo setup:** enable the Web Search plugin in the MiMo console (Plugin Management). Each ingest run makes three web-search requests plus one short reading request per new article (up to 40), and MiMo bills web search per request on top of tokens.

## Load one year of crime history (fast, no AI)

With the server running:

```powershell
Invoke-RestMethod -Method Post "http://localhost:8080/api/v1/admin/backfill?months=12" -Headers @{ "X-Admin-Token" = $env:SAFEROUTE_ADMIN_TOKEN }
Invoke-RestMethod http://localhost:8080/api/v1/admin/backfill    # progress, run again to refresh
```

The load works like this:

1. **Find articles.** GDELT is queried in 15-day windows (violent and property crime terms) for Bengaluru news.
2. **Read the headline.** Keyword rules read each headline and decide the crime type. Court cases, fraud, accidents and statistics are skipped.
3. **Place it.** The area named in the headline is looked up in OpenStreetMap's list of the city's neighbourhoods. If the headline names no area, the backend downloads the article and finds a sentence that names both an area and the crime.

Each URL is read once, and every incident links to its article. After the load, the scheduled job (every 3 hours) adds the last two weeks the same way. Set `SAFEROUTE_USE_MIMO=true` to use the slower MiMo reader instead.

The map shades ~1 km squares by how much crime was reported there; zoom in (level 14+) to see each report.

## Night-time brightness from NASA (optional)

NASA's Black Marble satellite product (VNP46A4, yearly, ~500 m squares) measures how bright each part of the city is at night. With it, routes through the city's darkest third count as less safe.

1. Create a free NASA Earthdata account, fill in **Affiliation** on https://urs.earthdata.nasa.gov/profile, then click **Generate Token**.
2. Run once (Python 3.10+):
   ```powershell
   py -m pip install blackmarblepy geopandas
   $env:BLACKMARBLE_TOKEN = "<token>"
   py tools\nightlights.py
   ```
   This writes `data/nightlights.csv`. The backend reads it on the next route search; no restart needed. Run it again once a year for the newest data.

Without the file, this factor is simply left out.

## Walking extras

For walking trips the response also includes:

- **Metro near your walk:** the nearest metro station (OpenStreetMap `railway=station` + `station=subway`) within 1.2 km of the start and of the end, with today's hours and whether it is open at the city's local time. Hours come from the station's OSM `opening_hours`. If a station has none, it says "Hours not listed". You can set network-wide hours in `saferoute.transit.operator-hours` (OSM syntax, e.g. `Mo-Su 05:00-23:00`), but they are used only when `operator-hours-source` names where you copied them from (e.g. the BMRCL website).
- **Open now:** for every route, how many shops and eateries within 100 m have OSM opening hours that say they are open right now. Places without readable hours are not counted.

## How crime reports are collected (MiMo mode)

Every step can reject a report. Only reports that pass every step are stored.

| Step | What is checked |
|---|---|
| Discovery | Three MiMo web searches per run (violent crime, theft, police-station reports), plus the free GDELT news index (Bengaluru crime articles from the last 12 weeks). Only pages these sources actually returned are used, so made-up URLs never enter. Each URL is read once and remembered; failed downloads are retried in a later run. |
| Read | The backend downloads each page itself. MiMo (no web search) reads that article text and extracts the crime type, locality, date and one sentence quoted word for word. Non-crime pages are dropped. |
| Verify | The quoted sentence, the locality and the city name must all appear in the article text. The crime type must be a supported street crime. |
| Date | The incident date (or, if not stated, the article's publish date from search or page metadata) must fall within the last 90 days, the same window the map uses. |
| Location | The locality is geocoded with Photon, restricted to the city's bounding box. The radius comes from the place's real extent (250–1500 m), because news gives an area, not an address. |
| Duplicates | The same crime type in the same locality within ±1 day becomes one incident with several sources. |

The map shows these reports as **news reports, not official police records**.

## How routes are ranked

1. **Candidates.** OSRM returns its own alternatives. If the fastest route crosses a reported-crime area, the backend asks for 2 detours that pass on either side of it. If there are still fewer than 3 routes, it asks for routes through points on either side of the fastest route. Any route more than 1.5× slower than the fastest is dropped, near-duplicates are merged, and up to 3 routes are returned.
2. **Measurements per route** (all computed, nothing estimated):
   - **Crime:** reported incidents whose area the route passes through, within the last 90 days. Violent crimes count 1.0 and property crimes 0.5. A report counts half as much after 30 days. Distance matters: an incident counts fully within a third of its area radius of the route, falling to a quarter at the edge of the area.
   - **Community reports:** spots reported by app users (harassment, suspicious activity, poorly lit, deserted, bad road) within 150 m of the route. Only spots reported by at least 3 different people count, closer spots count more, and reports expire after 60 days.
   - **Night-time darkness (NASA):** the share of the route in the city's darkest third according to NASA Black Marble satellite data. Used only if `data/nightlights.csv` exists and covers at least half of every route.
   - **Darkness:** the share of the route on roads OpenStreetMap tags `lit=no`.
   - **Main roads:** the share of the route on trunk, primary, secondary or tertiary roads rather than side streets.
   - **Activity:** shops, eateries, banks/ATMs, pharmacies and the like within 100 m of the route, per km.
   - **Police / hospital:** the share of the route within 1 km of a police station or hospital in OpenStreetMap.
3. **Missing data is left out, never counted as zero.** If no reports have been collected yet, or the trip is outside the city, the crime factor is skipped. If any candidate has less than 20% of its length tagged `lit` (or less than half matched to an OSM road), lighting (or road type) is skipped for all candidates. If nothing is measurable, only "Fastest" is labelled.
4. **Labels:**
   - **Fastest:** shortest travel time.
   - **Safest:** lowest weighted combination of the measured factors.
   - **Balanced:** a third route that is quicker than the safest and safer than the fastest. If no route sits in between, the label goes to whichever of the two is the better 50/50 trade-off.

   One route can carry more than one label. A route that is both fastest and safest is shown as such, and a slower, less safe route is never labelled "Balanced".

Weights and thresholds are in `application.yml` under `saferoute.safety`, and you can tune them. The API returns the factors and weights it used, and the app shows them under "How is 'Safest' chosen?".

## API

| Method | Path | Returns |
|---|---|---|
| POST | `/api/v1/routes` | `RouteResponse` (routes with `labels` + `safety` facts, and the method used) |
| GET | `/api/v1/incidents?south=&west=&north=&east=` | `IncidentsResponse` |
| GET | `/api/v1/geocode/search?q=&limit=&lat=&lng=` | `Location[]` |
| GET | `/api/v1/geocode/reverse?lat=&lng=` | `{ "place": Location \| null }` |
| GET | `/api/v1/community-reports?south=&west=&north=&east=` | Community spots (nearby reports of the same kind grouped; `confirmed` once 3 people reported) |
| POST | `/api/v1/community-reports` | Adds a report: `{ category, lat, lng, note?, deviceId }`. Limits: 5 per device and 20 per IP per day, one per spot per day. Device ids and IPs are stored only as salted hashes |
| GET | `/api/v1/status` | Pipeline health |
| POST | `/api/v1/admin/ingest` | Runs one ingest. Needs the `X-Admin-Token` header |

The frontend's `types/index.ts` mirrors these shapes.

## Configuration (environment variables)

| Variable | Default |
|---|---|
| `MIMO_API_KEY` | none (no ingest without it) |
| `MIMO_MODEL` | `mimo-v2.6-flash` |
| `SAFEROUTE_ADMIN_TOKEN` | none (manual ingest disabled) |
| `SAFEROUTE_INGEST_INTERVAL` | `PT3H` |
| `SAFEROUTE_ALLOWED_ORIGINS` | `http://localhost:3000` |
| `SAFEROUTE_ROUTER_URL` / `SAFEROUTE_GEOCODER_URL` / `SAFEROUTE_OVERPASS_URL` | the public FOSSGIS OSRM / Photon / Overpass servers |
| `PORT` | `8080` |

The city, its bounding box and all safety weights are set in `src/main/resources/application.yml`.

## Tests

```powershell
.\gradlew.bat test
```

The tests cover geometry, the full ingest pipeline (search → verify → geocode → merge), the article checks, parsing of OSRM and Overpass responses, and route labelling, including the cases where data is missing. They use synthetic fixtures in the providers' response formats, so no network is needed.

## Limits to know

- News covers only the crimes that get reported in the press, and locations are approximate (area level).
- OpenStreetMap lighting tags are sparse in many Indian cities, so lighting is often reported as "not mapped".
- Photon, OSRM (FOSSGIS) and Overpass are public, fair-use services, and this backend rate-limits its calls to them. For real traffic, self-host them or use paid providers.
- Travel times don't include live traffic.

## Community reports: what they can and can't do

Anyone using the app can report a spot. Without phone/OTP login, a determined person can still fake several devices. The limits above, the 3-different-reporters rule and 60-day expiry reduce this, but they don't eliminate it. OTP login needs a paid SMS provider and can be added later. The app always labels these as unverified community reports.
