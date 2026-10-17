package com.saferoute.route;

import com.saferoute.config.SafeRouteProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Loads data/nightlights.csv (written by tools/nightlights.py) and reloads it when the file changes. */
@Service
public class NightLightService {

    private static final Logger log = LoggerFactory.getLogger(NightLightService.class);

    private final Path file;
    private NightLightGrid grid;
    private long loadedModified = -1;

    public NightLightService(SafeRouteProperties properties) {
        this.file = Path.of(properties.nightLights().file());
    }

    /** The grid, or null when no night-light file has been generated yet. */
    public synchronized NightLightGrid grid() {
        try {
            if (!Files.exists(file)) return null;
            long modified = Files.getLastModifiedTime(file).toMillis();
            if (grid == null || modified != loadedModified) {
                grid = parse(Files.readAllLines(file, StandardCharsets.UTF_8));
                loadedModified = modified;
                log.info("Night lights loaded: {} cells ({})", grid.size(), grid.source());
            }
            return grid.isEmpty() ? null : grid;
        } catch (IOException | RuntimeException e) {
            log.warn("Night lights file unreadable: {}", e.getMessage());
            return null;
        }
    }

    static NightLightGrid parse(List<String> lines) {
        String source = "NASA Black Marble";
        List<double[]> rows = new ArrayList<>();
        for (String line : lines) {
            String t = line.trim();
            if (t.isEmpty()) continue;
            if (t.startsWith("#")) {
                source = t.substring(1).trim();
                continue;
            }
            if (t.startsWith("lat")) continue;
            String[] parts = t.split(",");
            if (parts.length < 3) continue;
            try {
                double v = Double.parseDouble(parts[2]);
                if (!Double.isFinite(v) || v < 0) continue;
                rows.add(new double[] {Double.parseDouble(parts[0]), Double.parseDouble(parts[1]), v});
            } catch (NumberFormatException ignored) {
                // skip malformed line
            }
        }
        return new NightLightGrid(rows, source);
    }
}
