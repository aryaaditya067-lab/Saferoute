package com.saferoute.community;

import com.saferoute.geo.BBox;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/community-reports")
public class CommunityController {

    private final CommunityService service;

    public CommunityController(CommunityService service) {
        this.service = service;
    }

    @GetMapping
    public CommunityService.SpotsResponse list(
            @RequestParam double south, @RequestParam double west, @RequestParam double north, @RequestParam double east) {
        return service.spotsIn(new BBox(south, west, north, east));
    }

    @PostMapping
    public ResponseEntity<CommunityService.Spot> submit(@RequestBody CommunityService.Submission body, HttpServletRequest request) {
        return ResponseEntity.status(201).body(service.submit(body, request.getRemoteAddr()));
    }
}
