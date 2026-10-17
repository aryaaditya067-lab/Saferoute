package com.saferoute.route;

import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** NASA Black Marble night-time brightness for the map's "Night view". */
@RestController
@RequestMapping("/api/v1/night-lights")
public class NightLightController {

    public record NightLightsResponse(
            boolean available,
            String source,
            String note,
            Double south, Double west, Double north, Double east,
            int rows, int cols,
            /** Row-major, north to south; null where there is no data. Unit nW/cm²/sr. */
            List<Double> values,
            double darkThreshold,
            double brightReference) {}

    private final NightLightService service;

    public NightLightController(NightLightService service) {
        this.service = service;
    }

    @GetMapping
    public NightLightsResponse get() {
        NightLightGrid grid = service.grid();
        if (grid == null || grid.raster() == null) {
            return new NightLightsResponse(false, null,
                    "Night-light data hasn't been generated yet. Run tools/nightlights.py in the backend folder.",
                    null, null, null, null, 0, 0, List.of(), 0, 0);
        }
        NightLightGrid.Raster r = grid.raster();
        List<Double> values = new ArrayList<>(r.values().length);
        for (double v : r.values()) values.add(Double.isNaN(v) ? null : Math.round(v * 10) / 10.0);
        return new NightLightsResponse(true, grid.source(),
                "Yearly average night-time brightness from NASA's Black Marble satellite product (~500 m squares).",
                r.south(), r.west(), r.north(), r.east(), r.rows(), r.cols(), values,
                grid.darkThreshold(), grid.brightReference());
    }
}
