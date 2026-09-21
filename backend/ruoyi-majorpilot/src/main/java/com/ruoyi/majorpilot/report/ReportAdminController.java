package com.ruoyi.majorpilot.report;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
@RestController @Profile("local") @RequestMapping("/api/admin/v1/majorpilot/reports")
public class ReportAdminController {
    private final ReportService service;public ReportAdminController(ReportService service){this.service=service;}
    @GetMapping @PreAuthorize("@ss.hasPermi('majorpilot:report:view')") Object list(HttpServletRequest req){return ApiResponses.success(req,service.adminList());}
    @GetMapping("/{id}") @PreAuthorize("@ss.hasPermi('majorpilot:report:view')") Object get(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,service.adminGet(id));}
    @PostMapping("/{id}/regenerations") @PreAuthorize("@ss.hasPermi('majorpilot:report:regenerate')") Object regenerate(@PathVariable String id,@RequestHeader(value="Idempotency-Key",required=false)String key,@RequestBody ReportDtos.Regenerate input,HttpServletRequest req){return ResponseEntity.accepted().body(ApiResponses.success(req,service.regenerate(SecurityUtils.getUserId(),id,key,input,ApiResponses.requestId(req))));}
    @GetMapping("/{id}/versions") @PreAuthorize("@ss.hasPermi('majorpilot:report:history:view')") Object versions(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,service.history(id));}
    @GetMapping("/{id}/versions/{version}") @PreAuthorize("@ss.hasPermi('majorpilot:report:history:view') and @ss.hasPermi('majorpilot:report:sensitive:view')") Object sensitive(@PathVariable String id,@PathVariable String version,HttpServletRequest req){return ApiResponses.success(req,service.sensitive(SecurityUtils.getUserId(),id,version,ApiResponses.requestId(req)));}
}
