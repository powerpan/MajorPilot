package com.ruoyi.majorpilot.pilot;

import com.ruoyi.majorpilot.auth.AuthDtos;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

@RestController @Profile("pilot")
public class PilotController {
    private final PilotAccess access;
    private final ReportAllowances allowances;
    public PilotController(PilotAccess access,ReportAllowances allowances){this.access=access;this.allowances=allowances;}
    public record Acceptance(List<AuthDtos.Consent> consents) {}
    @GetMapping("/api/app/v1/pilot") public Object status(HttpServletRequest req){long id=ApiResponses.student(req).internalId();return ApiResponses.success(req,Map.of("consented",access.consented(id),"allowances",allowances.current(id)));}
    @PostMapping("/api/app/v1/pilot/consent") public Object consent(@RequestBody Acceptance body,HttpServletRequest req){access.accept(ApiResponses.student(req).internalId(),body.consents());return status(req);}
}
