package com.ruoyi.majorpilot.intake;

import com.ruoyi.majorpilot.shared.ApiResponses;
import com.ruoyi.majorpilot.security.RateLimits;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @Profile({"local","pilot"})
public class ProfileController {
    private final ProfileService profiles;private final RateLimits limits;
    public ProfileController(ProfileService profiles,RateLimits limits){this.profiles=profiles;this.limits=limits;}
    @GetMapping("/api/app/v1/profile") public Object get(HttpServletRequest req){return ApiResponses.success(req,profiles.get(ApiResponses.student(req)));}
    @PutMapping("/api/app/v1/profile/draft") public Object save(@RequestBody ProfileService.Input input,HttpServletRequest req){return ApiResponses.success(req,profiles.save(ApiResponses.student(req),input));}
    @PostMapping("/api/app/v1/profile/draft/discard") public Object discard(@RequestBody ProfileService.Revision input,HttpServletRequest req){return ApiResponses.success(req,profiles.discard(ApiResponses.student(req),input));}
    @PostMapping("/api/app/v1/profile/submit") public Object submit(@RequestBody ProfileService.Input input,@RequestHeader(value="Idempotency-Key",required=false) String key,HttpServletRequest req){
        var student=ApiResponses.student(req);limits.require("profile-submit",student.publicId(),30,Duration.ofHours(1));
        return ResponseEntity.status(201).body(ApiResponses.success(req,profiles.submit(student,key,input)));
    }
}
