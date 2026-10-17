package com.saferoute.route;

import com.saferoute.geo.Geo;
import com.saferoute.geo.LatLng;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;

/**
 * The main-road network (trunk / primary / secondary / tertiary from OpenStreetMap) as a graph,
 * for finding a walk that stays on main roads and, with NASA night lights, on the brighter ones.
 *
 * <p>Ways that meet share a node in OSM, so their geometry has an identical coordinate there;
 * vertices are keyed by coordinates rounded to ~10 cm.
 */
final class MainRoadGraph {

    private final List<LatLng> vertices = new ArrayList<>();
    private final List<List<int[]>> edges = new ArrayList<>(); // [to, lengthCm]
    private final Map<Long, Integer> index = new HashMap<>();

    MainRoadGraph(List<List<LatLng>> roads) {
        for (List<LatLng> road : roads) {
            int prev = -1;
            for (LatLng p : road) {
                int v = vertex(p);
                if (prev >= 0 && prev != v) {
                    int len = (int) Math.max(1, Math.round(Geo.distanceMeters(vertices.get(prev), p) * 100));
                    edges.get(prev).add(new int[] {v, len});
                    edges.get(v).add(new int[] {prev, len});
                }
                prev = v;
            }
        }
    }

    int size() {
        return vertices.size();
    }

    private int vertex(LatLng p) {
        long key = Math.round(p.lat() * 1e6) * 4_000_000_000L + Math.round(p.lng() * 1e6);
        Integer v = index.get(key);
        if (v != null) return v;
        vertices.add(p);
        edges.add(new ArrayList<>());
        index.put(key, vertices.size() - 1);
        return vertices.size() - 1;
    }

    private int nearest(LatLng p, double maxMeters) {
        int best = -1;
        double bestD = maxMeters;
        for (int i = 0; i < vertices.size(); i++) {
            LatLng v = vertices.get(i);
            if (Math.abs(v.lat() - p.lat()) > 0.02 || Math.abs(v.lng() - p.lng()) > 0.02) continue;
            double d = Geo.distanceMeters(p, v);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        return best;
    }

    /**
     * Path along main roads from the main road nearest {@code from} to the one nearest {@code to}
     * (each within {@code maxSnapMeters}). Each metre costs 1 + 4 × darkness, where darkness comes
     * from the NASA grid (0 bright … 1 dark; unknown counts as 0.5), so brighter main roads win.
     * Null when either end is too far from a main road or they are not connected.
     */
    List<LatLng> path(LatLng from, LatLng to, NightLightGrid lights, double maxSnapMeters) {
        int s = nearest(from, maxSnapMeters), t = nearest(to, maxSnapMeters);
        if (s < 0 || t < 0) return null;
        if (s == t) return List.of(vertices.get(s));
        double ref = lights == null ? 1 : Math.log1p(Math.max(1, lights.brightReference()));
        double[] dist = new double[vertices.size()];
        int[] prev = new int[vertices.size()];
        Arrays.fill(dist, Double.POSITIVE_INFINITY);
        Arrays.fill(prev, -1);
        dist[s] = 0;
        PriorityQueue<double[]> queue = new PriorityQueue<>((a, b) -> Double.compare(a[0], b[0]));
        queue.add(new double[] {0, s});
        while (!queue.isEmpty()) {
            double[] top = queue.poll();
            int u = (int) top[1];
            if (top[0] > dist[u]) continue;
            if (u == t) break;
            for (int[] e : edges.get(u)) {
                double meters = e[1] / 100.0;
                double darkness = 0.5;
                if (lights != null) {
                    LatLng a = vertices.get(u), b = vertices.get(e[0]);
                    Double v = lights.radianceAt(new LatLng((a.lat() + b.lat()) / 2, (a.lng() + b.lng()) / 2));
                    if (v != null) darkness = 1 - Math.min(1, Math.log1p(Math.max(0, v)) / ref);
                }
                double nd = dist[u] + meters * (1 + 4 * darkness);
                if (nd < dist[e[0]]) {
                    dist[e[0]] = nd;
                    prev[e[0]] = u;
                    queue.add(new double[] {nd, e[0]});
                }
            }
        }
        if (prev[t] < 0) return null;
        List<LatLng> out = new ArrayList<>();
        for (int v = t; v >= 0; v = prev[v]) {
            out.add(vertices.get(v));
            if (v == s) break;
        }
        Collections.reverse(out);
        return out;
    }
}
