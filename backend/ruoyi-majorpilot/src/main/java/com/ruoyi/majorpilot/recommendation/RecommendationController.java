package com.ruoyi.majorpilot.recommendation;

import java.time.Duration;
import jakarta.servlet.http.HttpServletRequest;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.ApiResponses;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @Profile({"local","pilot"})
public class RecommendationController {
    private final StudentRecommendationService service;private final RateLimits limits;
    public RecommendationController(StudentRecommendationService service,RateLimits limits) { this.service=service;this.limits=limits; }
    @GetMapping("/api/app/v1/dashboard") Object dashboard(HttpServletRequest req) { return ApiResponses.success(req,service.dashboard(ApiResponses.student(req))); }
    @GetMapping("/api/app/v1/decision-profiles") Object profiles(HttpServletRequest req) { return ApiResponses.success(req,service.profiles(ApiResponses.student(req))); }
    @PostMapping("/api/app/v1/decision-profiles") Object submit(@RequestBody StudentRecommendationService.ProfileInput input,@RequestHeader(value="Idempotency-Key",required=false) String key,HttpServletRequest req) {
        var student=ApiResponses.student(req);limits.require("profile-submit",student.publicId(),30,Duration.ofHours(1));return ResponseEntity.status(201).body(ApiResponses.success(req,service.submit(student,key,input)));
    }
    @GetMapping("/api/app/v1/recommendations/{id}") Object get(@PathVariable String id,HttpServletRequest req) { return ApiResponses.success(req,service.get(ApiResponses.student(req),id)); }
    @PostMapping("/api/app/v1/recommendations/{id}/decision") Object decide(@PathVariable String id,@RequestBody StudentRecommendationService.DecisionInput input,@RequestHeader(value="Idempotency-Key",required=false) String key,HttpServletRequest req) {
        var student=ApiResponses.student(req);limits.require("recommendation-decision",student.publicId(),60,Duration.ofHours(1));return ResponseEntity.status(201).body(ApiResponses.success(req,service.decide(student,id,key,input)));
    }
}
