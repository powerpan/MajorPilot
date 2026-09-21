package com.ruoyi.majorpilot.operations;

import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController @Profile("local") @RequestMapping("/api/admin/v1/majorpilot/exports")
@PreAuthorize("@ss.hasPermi('majorpilot:export:create')")
public class AdminExportController {
    private final AdminExportService service;public AdminExportController(AdminExportService service){this.service=service;}
    @PostMapping Object create(@RequestHeader(value="Idempotency-Key",required=false)String key,@RequestBody OperationsDtos.ExportCreate input,HttpServletRequest r){return ResponseEntity.accepted().body(ApiResponses.success(r,service.create(SecurityUtils.getUserId(),key,input,ApiResponses.requestId(r))));}
    @GetMapping("/{id}") Object status(@PathVariable String id,HttpServletRequest r){return ApiResponses.success(r,service.status(SecurityUtils.getUserId(),id));}
    @GetMapping("/{id}/download") Object download(@PathVariable String id,HttpServletRequest r){return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"no-store").header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=majorpilot-analysis.csv").contentType(MediaType.parseMediaType("text/csv;charset=UTF-8")).body(service.download(SecurityUtils.getUserId(),id,ApiResponses.requestId(r)));}
}
