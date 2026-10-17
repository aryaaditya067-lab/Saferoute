package com.saferoute.route;

import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import com.saferoute.support.FakeHttp;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Synthetic test geometry: a direct route A (fastest) that passes a reported
 * incident, and a longer route B along lit roads near a police station.
 */
final class RouteScenario {

    static final LatLng PICKUP = new LatLng(12.9716, 77.5946);
    static final LatLng DESTINATION = new LatLng(12.9352, 77.6245);
    static final LatLng BEND = new LatLng(12.9640, 77.6230);
    static final List<LatLng> ROUTE_A = densify(List.of(PICKUP, DESTINATION));
    static final List<LatLng> ROUTE_B = densify(List.of(PICKUP, BEND, DESTINATION));
    static final LatLng A_MIDDLE = ROUTE_A.get(ROUTE_A.size() / 2);
    static final LatLng POLICE_ON_B = Geo.offset(BEND, 0, 300);
    static final LatLng HOSPITAL_ON_A = Geo.offset(PICKUP, 180, 400);

    private RouteScenario() {}

    static List<LatLng> densify(List<LatLng> corners) {
        List<LatLng> out = new ArrayList<>();
        for (int i = 1; i < corners.size(); i++) {
            List<LatLng> part = Geo.resample(List.of(corners.get(i - 1), corners.get(i)), 100);
            if (!out.isEmpty()) part = part.subList(1, part.size());
            out.addAll(part);
        }
        return out;
    }

    static String coords(List<LatLng> line) {
        return line.stream().map(p -> String.format(Locale.ROOT, "[%.6f,%.6f]", p.lng(), p.lat())).collect(Collectors.joining(","));
    }

    static String osrmRoute(List<LatLng> line, double duration, String summary) {
        return String.format(Locale.ROOT,
                "{\"distance\":%.1f,\"duration\":%.1f,\"weight\":%.1f,\"weight_name\":\"routability\",\"geometry\":{\"type\":\"LineString\",\"coordinates\":[%s]},"
                        + "\"legs\":[{\"summary\":\"%s\",\"distance\":%.1f,\"duration\":%.1f,\"steps\":[]}]}",
                Geo.lengthMeters(line), duration, duration, coords(line), summary, Geo.lengthMeters(line), duration);
    }

    static String osrmAlternatives() {
        return "{\"code\":\"Ok\",\"waypoints\":[],\"routes\":[" + osrmRoute(ROUTE_A, 1200, "Hosur Road")
                + "," + osrmRoute(ROUTE_B, 1400, "Old Airport Road, Inner Ring Road") + "]}";
    }

    /** OSRM answer for pickup → via → destination. */
    static String osrmVia(String url) {
        String path = url.substring(url.indexOf("/driving/") + 9, url.indexOf('?'));
        String[] parts = path.split(";");
        String[] via = parts[1].split(",");
        LatLng v = new LatLng(Double.parseDouble(via[1]), Double.parseDouble(via[0]));
        return "{\"code\":\"Ok\",\"waypoints\":[],\"routes\":[" + osrmRoute(densify(List.of(PICKUP, v, DESTINATION)), 1500, "Detour Road") + "]}";
    }

    static String overpass() {
        StringBuilder b = new StringBuilder("{\"elements\":[");
        b.append(way(1, ROUTE_B, "primary", "yes")).append(',');
        b.append(way(2, ROUTE_A.subList(0, ROUTE_A.size() / 2 + 1), "residential", "no")).append(',');
        b.append(way(3, ROUTE_A.subList(ROUTE_A.size() / 2, ROUTE_A.size()), "residential", null)).append(',');
        for (int i = 0; i < 6; i++) {
            LatLng shop = Geo.offset(ROUTE_B.get(i * 10 + 5), 0, 40);
            b.append(String.format(Locale.ROOT, "{\"type\":\"node\",\"id\":%d,\"lat\":%.6f,\"lon\":%.6f,\"tags\":{\"shop\":\"supermarket\"}},",
                    100 + i, shop.lat(), shop.lng()));
        }
        b.append(String.format(Locale.ROOT, "{\"type\":\"node\",\"id\":10,\"lat\":%.6f,\"lon\":%.6f,\"tags\":{\"amenity\":\"police\",\"name\":\"Test Police Station\"}},",
                POLICE_ON_B.lat(), POLICE_ON_B.lng()));
        b.append(String.format(Locale.ROOT, "{\"type\":\"way\",\"id\":11,\"center\":{\"lat\":%.6f,\"lon\":%.6f},\"tags\":{\"amenity\":\"hospital\",\"name\":\"Test Hospital\"}}",
                HOSPITAL_ON_A.lat(), HOSPITAL_ON_A.lng()));
        return b.append("]}").toString();
    }

    private static String way(long id, List<LatLng> line, String highway, String lit) {
        String geometry = line.stream().map(p -> String.format(Locale.ROOT, "{\"lat\":%.6f,\"lon\":%.6f}", p.lat(), p.lng()))
                .collect(Collectors.joining(","));
        String litTag = lit == null ? "" : ",\"lit\":\"" + lit + "\"";
        return "{\"type\":\"way\",\"id\":" + id + ",\"geometry\":[" + geometry + "],\"tags\":{\"highway\":\"" + highway + "\"" + litTag + "}}";
    }

    static FakeHttp http(boolean overpassWorks) {
        return new FakeHttp(url -> {
            if (url.startsWith("https://router.test")) {
                long waypoints = url.substring(url.indexOf("/driving/"), url.indexOf('?')).chars().filter(ch -> ch == ';').count() + 1;
                return FakeHttp.json(waypoints == 2 ? osrmAlternatives() : osrmVia(url));
            }
            if (url.startsWith("https://overpass.test")) return overpassWorks ? FakeHttp.json(overpass()) : FakeHttp.status(504);
            return FakeHttp.status(404);
        });
    }
}
