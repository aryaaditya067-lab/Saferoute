package com.saferoute.route;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/routes")
public class RouteController {

    private final RouteSafetyService service;

    public RouteController(RouteSafetyService service) {
        this.service = service;
    }

    @PostMapping
    public RouteDtos.RouteResponse plan(@RequestBody RouteDtos.RouteRequest request) {
        return service.plan(request);
    }
}
