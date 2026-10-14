package com.ruoyi.majorpilot.experience;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
@RestController @Profile({"local","pilot"}) @RequestMapping("/api/admin/v1/majorpilot")
public class RunAdminController {
    private final RunService runs;public RunAdminController(RunService runs){this.runs=runs;}
    @PostMapping("/experience-runs/{id}/recovery-runs") @PreAuthorize("@ss.hasPermi('majorpilot:recovery:create')")
    Object recover(@PathVariable String id,@RequestBody RunDtos.Recovery input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,runs.recover(SecurityUtils.getUserId(),id,key,input,ApiResponses.requestId(req)));}
}
