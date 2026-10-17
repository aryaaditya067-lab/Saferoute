package com.saferoute.geocode;

import com.saferoute.geo.LatLng;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/geocode")
public class GeocodeController {

    private final PhotonGeocoder geocoder;

    public GeocodeController(PhotonGeocoder geocoder) {
        this.geocoder = geocoder;
    }

    @GetMapping("/search")
    public List<PlaceDto> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "6") int limit,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng) {
        LatLng near = lat != null && lng != null ? new LatLng(lat, lng) : null;
        return geocoder.search(q, limit, near);
    }

    /** Always an object, so "nothing here" is {"place": null} rather than an empty body. */
    public record ReverseResponse(PlaceDto place) {}

    @GetMapping("/reverse")
    public ReverseResponse reverse(@RequestParam double lat, @RequestParam double lng) {
        return new ReverseResponse(geocoder.reverse(new LatLng(lat, lng)));
    }
}
