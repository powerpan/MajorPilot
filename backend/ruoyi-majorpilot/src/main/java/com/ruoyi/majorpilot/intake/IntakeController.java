package com.ruoyi.majorpilot.intake;

import java.time.Duration;
import java.time.Instant;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.ruoyi.majorpilot.recommendation.RecommendationView;
import com.ruoyi.majorpilot.recommendation.MajorCatalog;
import com.ruoyi.majorpilot.security.CsrfService;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @Profile({"local","pilot"})
public class IntakeController {
    public record Create(String questionnaireVersion) {}
    private final IntakeService intakes;private final CsrfService csrf;private final RateLimits limits;private final MajorCatalog catalog;
    public IntakeController(IntakeService intakes,CsrfService csrf,RateLimits limits,MajorCatalog catalog) { this.intakes=intakes;this.csrf=csrf;this.limits=limits;this.catalog=catalog; }
    @GetMapping("/api/public/v1/majors") Object majors(HttpServletRequest req) { return ApiResponses.success(req,catalog.majors()); }
    @GetMapping("/api/public/v1/questionnaires/current") Object questionnaire(HttpServletRequest req) { return ApiResponses.success(req,QuestionnaireDefinition.current()); }
    @PostMapping("/api/public/v1/intake-sessions") Object create(@RequestBody Create input,HttpServletRequest req,HttpServletResponse res) {
        limits.require("intake-create",req.getRemoteAddr(),30,Duration.ofHours(1));
        String previous=ApiResponses.cookie(req,"MP_INTAKE");var created=intakes.create(input.questionnaireVersion(),previous);
        String secret=created.newSecret()==null?previous:created.newSecret();
        ApiResponses.setIntakeCookie(res,secret,created.view().expiresAt());csrf.publicToken(req,res,Secrets.hash(secret));
        return ResponseEntity.status(created.newSecret()==null?200:201).body(ApiResponses.success(req,created.view()));
    }
    @GetMapping("/api/public/v1/intake-sessions/{id}") Object get(@PathVariable String id,HttpServletRequest req,HttpServletResponse res) {
        var value=intakes.get(id,ApiResponses.intakeSecretHash(req));ApiResponses.setIntakeCookie(res,ApiResponses.cookie(req,"MP_INTAKE"),value.expiresAt());return ApiResponses.success(req,value);
    }
    @PutMapping("/api/public/v1/intake-sessions/{id}/draft") Object save(@PathVariable String id,@RequestBody IntakeService.Draft input,HttpServletRequest req,HttpServletResponse res) {
        var value=intakes.save(id,ApiResponses.intakeSecretHash(req),input);ApiResponses.setIntakeCookie(res,ApiResponses.cookie(req,"MP_INTAKE"),value.expiresAt());return ApiResponses.success(req,value);
    }
    @PostMapping("/api/public/v1/intake-sessions/{id}/submit") Object submit(@PathVariable String id,@RequestBody IntakeService.Submission input,@RequestHeader(value="Idempotency-Key",required=false) String key,HttpServletRequest req,HttpServletResponse res) {
        String hash=ApiResponses.intakeSecretHash(req);limits.require("intake-submit",hash,30,Duration.ofHours(1));
        var value=intakes.submit(id,hash,key,input);renew(req,res,id,hash);return ResponseEntity.status(201).body(ApiResponses.success(req,value));
    }
    @GetMapping("/api/public/v1/intake-sessions/{id}/recommendation") Object recommendation(@PathVariable String id,HttpServletRequest req,HttpServletResponse res) {
        String hash=ApiResponses.intakeSecretHash(req);var value=intakes.recommendation(id,hash);renew(req,res,id,hash);return ApiResponses.success(req,value);
    }
    private void renew(HttpServletRequest req,HttpServletResponse res,String id,String hash) { Instant expiry=intakes.expiration(id,hash);if(expiry!=null)ApiResponses.setIntakeCookie(res,ApiResponses.cookie(req,"MP_INTAKE"),expiry); }
}
