package com.saferoute.route;

import com.saferoute.geo.LatLng;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * NASA Black Marble night-time radiance on a ~500 m grid (15 arc-seconds), loaded
 * from data/nightlights.csv. "Dark" means the darkest third of the city's cells.
 */
public final class NightLightGrid {

    /** Cells per degree (15 arc-seconds). */
    static final double CELLS_PER_DEGREE = 240;

    private final Map<Long, Double> cells;
    private final double darkThreshold;
    private final String source;
    private final double brightReference;
    private long minRow = Long.MAX_VALUE, maxRow = Long.MIN_VALUE, minCol = Long.MAX_VALUE, maxCol = Long.MIN_VALUE;
    private Raster raster;

    /** The grid as a north-up raster for drawing; values are NaN where there is no data. */
    public record Raster(double south, double west, double north, double east, int rows, int cols, double[] values) {}

    public NightLightGrid(List<double[]> rows, String source) {
        this.cells = new HashMap<>();
        double[] values = new double[rows.size()];
        int i = 0;
        for (double[] r : rows) {
            cells.put(key(r[0], r[1]), r[2]);
            values[i++] = r[2];
            long row = (long) Math.floor(r[0] * CELLS_PER_DEGREE);
            long col = (long) Math.floor(r[1] * CELLS_PER_DEGREE);
            minRow = Math.min(minRow, row);
            maxRow = Math.max(maxRow, row);
            minCol = Math.min(minCol, col);
            maxCol = Math.max(maxCol, col);
        }
        Arrays.sort(values);
        this.darkThreshold = values.length == 0 ? 0 : values[(int) Math.floor((values.length - 1) / 3.0)];
        this.brightReference = values.length == 0 ? 0 : values[(int) Math.floor((values.length - 1) * 0.98)];
        this.source = source;
    }

    /** 98th-percentile radiance: anything brighter is drawn at full brightness. */
    public double brightReference() {
        return brightReference;
    }

    public synchronized Raster raster() {
        if (raster != null || cells.isEmpty()) return raster;
        int rows = (int) (maxRow - minRow + 1);
        int cols = (int) (maxCol - minCol + 1);
        double[] out = new double[rows * cols];
        Arrays.fill(out, Double.NaN);
        for (Map.Entry<Long, Double> e : cells.entrySet()) {
            long row = Math.floorDiv(e.getKey(), 1_000_000L);
            long col = e.getKey() - row * 1_000_000L;
            // Keys use non-negative longitudes here (Bengaluru); north-up: first row is the northernmost.
            int r = (int) (maxRow - row);
            int c = (int) (col - minCol);
            if (r >= 0 && r < rows && c >= 0 && c < cols) out[r * cols + c] = e.getValue();
        }
        raster = new Raster(minRow / CELLS_PER_DEGREE, minCol / CELLS_PER_DEGREE,
                (maxRow + 1) / CELLS_PER_DEGREE, (maxCol + 1) / CELLS_PER_DEGREE, rows, cols, out);
        return raster;
    }

    private static long key(double lat, double lng) {
        long row = (long) Math.floor(lat * CELLS_PER_DEGREE);
        long col = (long) Math.floor(lng * CELLS_PER_DEGREE);
        return row * 1_000_000L + col;
    }

    public Double radianceAt(LatLng p) {
        return cells.get(key(p.lat(), p.lng()));
    }

    public boolean isEmpty() {
        return cells.isEmpty();
    }

    public int size() {
        return cells.size();
    }

    /**
     * The brightest cell within {@code radiusMeters} of {@code center}, slightly favouring nearer
     * cells; null when there is no data there. Used to find lit areas a route could pass through.
     */
    public LatLng brightestNear(LatLng center, double radiusMeters) {
        double cosLat = Math.max(0.1, Math.cos(Math.toRadians(center.lat())));
        long r0 = (long) Math.floor(center.lat() * CELLS_PER_DEGREE), c0 = (long) Math.floor(center.lng() * CELLS_PER_DEGREE);
        int dr = (int) Math.ceil(radiusMeters / 111_320.0 * CELLS_PER_DEGREE);
        int dc = (int) Math.ceil(radiusMeters / (111_320.0 * cosLat) * CELLS_PER_DEGREE);
        LatLng best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (long r = r0 - dr; r <= r0 + dr; r++) {
            for (long c = c0 - dc; c <= c0 + dc; c++) {
                Double v = cells.get(r * 1_000_000L + c);
                if (v == null) continue;
                LatLng p = new LatLng((r + 0.5) / CELLS_PER_DEGREE, (c + 0.5) / CELLS_PER_DEGREE);
                double d = com.saferoute.geo.Geo.distanceMeters(center, p);
                if (d > radiusMeters) continue;
                double score = Math.log1p(v) - 0.12 * d / 1000;
                if (score > bestScore) {
                    bestScore = score;
                    best = p;
                }
            }
        }
        return best;
    }

    /**
     * The best-lit path across the grid from {@code from} to {@code to}: a shortest path over
     * ~500 m cells where a dark (or unmapped) cell costs up to 6× a bright one. It shows which
     * corridor of the city stays lit, e.g. a main road, so routes can be asked to follow it.
     * Null when the area is too large or has no data.
     */
    public List<LatLng> brightestPath(LatLng from, LatLng to, double marginMeters) {
        return brightestPath(from, to, marginMeters, List.of());
    }

    /**
     * As above, but cells a main road runs through are cheap even when dim (a dark main road
     * still has traffic and people; a dark back lane is the worst place to walk).
     */
    public List<LatLng> brightestPath(LatLng from, LatLng to, double marginMeters, List<List<LatLng>> mainRoads) {
        double cosLat = Math.max(0.1, Math.cos(Math.toRadians((from.lat() + to.lat()) / 2)));
        int mr = (int) Math.ceil(marginMeters / 111_320.0 * CELLS_PER_DEGREE);
        int mc = (int) Math.ceil(marginMeters / (111_320.0 * cosLat) * CELLS_PER_DEGREE);
        long ra = (long) Math.floor(from.lat() * CELLS_PER_DEGREE), ca = (long) Math.floor(from.lng() * CELLS_PER_DEGREE);
        long rb = (long) Math.floor(to.lat() * CELLS_PER_DEGREE), cb = (long) Math.floor(to.lng() * CELLS_PER_DEGREE);
        long r0 = Math.min(ra, rb) - mr, c0 = Math.min(ca, cb) - mc;
        int rows = (int) (Math.max(ra, rb) + mr - r0 + 1), cols = (int) (Math.max(ca, cb) + mc - c0 + 1);
        if ((long) rows * cols > 60_000 || cells.isEmpty()) return null;
        double ref = Math.log1p(Math.max(1, brightReference));
        boolean[] main = new boolean[rows * cols];
        for (List<LatLng> road : mainRoads) {
            for (LatLng p : com.saferoute.geo.Geo.resample(road, 120)) {
                long r = (long) Math.floor(p.lat() * CELLS_PER_DEGREE) - r0, c = (long) Math.floor(p.lng() * CELLS_PER_DEGREE) - c0;
                if (r >= 0 && c >= 0 && r < rows && c < cols) main[(int) (r * cols + c)] = true;
            }
        }
        double[] cost = new double[rows * cols];
        for (int r = 0; r < rows; r++) for (int c = 0; c < cols; c++) {
            Double v = cells.get((r0 + r) * 1_000_000L + (c0 + c));
            double bright = v == null ? 0 : Math.min(1, Math.log1p(Math.max(0, v)) / ref);
            int i = r * cols + c;
            cost[i] = main[i] ? 1 + 1.5 * (1 - bright) : 1 + 5 * (1 - bright);
        }
        int start = (int) ((ra - r0) * cols + (ca - c0)), goal = (int) ((rb - r0) * cols + (cb - c0));
        double[] dist = new double[rows * cols];
        int[] prev = new int[rows * cols];
        Arrays.fill(dist, Double.POSITIVE_INFINITY);
        Arrays.fill(prev, -1);
        dist[start] = 0;
        java.util.PriorityQueue<double[]> queue = new java.util.PriorityQueue<>((x, y) -> Double.compare(x[0], y[0]));
        queue.add(new double[] {0, start});
        int[] dr = {-1, -1, -1, 0, 0, 1, 1, 1}, dc = {-1, 0, 1, -1, 1, -1, 0, 1};
        while (!queue.isEmpty()) {
            double[] top = queue.poll();
            int u = (int) top[1];
            if (top[0] > dist[u]) continue;
            if (u == goal) break;
            int ur = u / cols, uc = u % cols;
            for (int k = 0; k < 8; k++) {
                int vr = ur + dr[k], vc = uc + dc[k];
                if (vr < 0 || vc < 0 || vr >= rows || vc >= cols) continue;
                int v = vr * cols + vc;
                double step = (dr[k] != 0 && dc[k] != 0 ? Math.sqrt(2) : 1) * (cost[u] + cost[v]) / 2;
                if (dist[u] + step < dist[v]) {
                    dist[v] = dist[u] + step;
                    prev[v] = u;
                    queue.add(new double[] {dist[v], v});
                }
            }
        }
        if (prev[goal] < 0 && goal != start) return null;
        List<LatLng> path = new ArrayList<>();
        for (int v = goal; v >= 0; v = prev[v]) {
            path.add(new LatLng((r0 + v / cols + 0.5) / CELLS_PER_DEGREE, (c0 + v % cols + 0.5) / CELLS_PER_DEGREE));
            if (v == start) break;
        }
        java.util.Collections.reverse(path);
        return path;
    }

    public double darkThreshold() {
        return darkThreshold;
    }

    public String source() {
        return source;
    }

    /** Share of the samples in the city's darkest third, and share that had data at all. */
    public RouteSafety.NightLight measure(List<LatLng> samples) {
        if (samples.isEmpty()) return RouteSafety.NightLight.unavailable();
        int covered = 0, dark = 0, run = 0, longest = 0;
        double sum = 0, darkness = 0, ref = Math.log1p(Math.max(1, brightReference));
        List<List<double[]>> stretches = new ArrayList<>();
        List<double[]> current = new ArrayList<>();
        int minSamples = (int) Math.ceil(150 / SafetyScorer.SAMPLE_STEP_METERS);
        for (LatLng p : samples) {
            Double v = radianceAt(p);
            boolean isDark = v != null && v <= darkThreshold;
            if (isDark) {
                current.add(new double[] {SafetyScorer.round(p.lat(), 6), SafetyScorer.round(p.lng(), 6)});
            } else if (!current.isEmpty()) {
                if (current.size() >= minSamples) stretches.add(thin(current));
                current = new ArrayList<>();
            }
            if (v == null) continue;
            covered++;
            sum += v;
            darkness += 1 - Math.min(1, Math.log1p(Math.max(0, v)) / ref);
            if (isDark) {
                dark++;
                longest = Math.max(longest, ++run);
            } else {
                run = 0;
            }
        }
        if (current.size() >= minSamples) stretches.add(thin(current));
        if (covered == 0) return RouteSafety.NightLight.unavailable();
        return new RouteSafety.NightLight(true,
                SafetyScorer.round(dark / (double) covered, 3),
                SafetyScorer.round(covered / (double) samples.size(), 3),
                SafetyScorer.round(sum / covered, 2),
                SafetyScorer.round(darkness / covered, 3),
                Math.round(longest * SafetyScorer.SAMPLE_STEP_METERS),
                stretches);
    }

    /** Every other point (samples are 25 m apart; 50 m is plenty for drawing), keeping the last. */
    private static List<double[]> thin(List<double[]> line) {
        List<double[]> out = new ArrayList<>();
        for (int i = 0; i < line.size(); i += 2) out.add(line.get(i));
        if ((line.size() - 1) % 2 != 0) out.add(line.get(line.size() - 1));
        return out;
    }
}
