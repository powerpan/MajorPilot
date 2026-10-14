package com.ruoyi.majorpilot.analytics;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.ruoyi.majorpilot.intake.IntakeService;
import com.ruoyi.majorpilot.shared.ApiResponses;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @Profile({"local","pilot"})
public class PageEventController {
    private final PageEventService service;private final IntakeService intakes;
    public PageEventController(PageEventService service,IntakeService intakes) { this.service=service;this.intakes=intakes; }
    @PostMapping("/api/public/v1/events") Object publicEvents(@RequestBody PageEventService.Batch batch,HttpServletRequest req,HttpServletResponse res) {
        String hash=ApiResponses.intakeSecretHash(req);var result=service.intake(hash,batch);var expiry=intakes.expirationForSecret(hash);
        if(expiry!=null)ApiResponses.setIntakeCookie(res,ApiResponses.cookie(req,"MP_INTAKE"),expiry);
        return ResponseEntity.accepted().body(ApiResponses.success(req,result));
    }
    @PostMapping("/api/app/v1/events") Object studentEvents(@RequestBody PageEventService.Batch batch,HttpServletRequest req) { return ResponseEntity.accepted().body(ApiResponses.success(req,service.student(ApiResponses.student(req),batch))); }
}
