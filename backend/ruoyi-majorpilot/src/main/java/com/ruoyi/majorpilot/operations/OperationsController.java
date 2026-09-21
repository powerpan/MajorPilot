package com.ruoyi.majorpilot.operations;

import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController @Profile("local") @RequestMapping("/api/admin/v1/majorpilot")
public class OperationsController {
    private final OperationsService service;private final OperationsMetrics metrics;private final OperationsHealth health;
    public OperationsController(OperationsService service,OperationsMetrics metrics,OperationsHealth health){this.service=service;this.metrics=metrics;this.health=health;}
    private long operator(){return SecurityUtils.getUserId();}
    @GetMapping("/overview") @PreAuthorize("@ss.hasPermi('majorpilot:overview:view')") Object overview(@RequestParam Map<String,String> q,HttpServletRequest r){var result=(com.fasterxml.jackson.databind.node.ObjectNode)service.mapper.valueToTree(metrics.overview(operator(),OperationsQuery.parse(q).withoutReportType().filters()));result.set("health",service.mapper.valueToTree(health.status(operator())));return ApiResponses.success(r,result);}
    @GetMapping("/students") @PreAuthorize("@ss.hasPermi('majorpilot:student:view')") Object students(@RequestParam Map<String,String> q,HttpServletRequest r){return ApiResponses.success(r,service.students(operator(),OperationsQuery.parse(q).withoutReportType()));}
    @GetMapping("/students/{id}") @PreAuthorize("@ss.hasPermi('majorpilot:student:view')") Object student(@PathVariable String id,HttpServletRequest r){return ApiResponses.success(r,service.studentDetail(operator(),id));}
    @PatchMapping("/students/{id}/analytics-exclusion") @PreAuthorize("@ss.hasPermi('majorpilot:analytics:manage')") Object exclude(@PathVariable String id,@RequestHeader(value="Idempotency-Key",required=false)String key,@RequestBody OperationsDtos.Exclusion input,HttpServletRequest r){return ApiResponses.success(r,service.exclusion(operator(),id,key,input,ApiResponses.requestId(r)));}
    @PostMapping("/students/{id}/sensitive-view") @PreAuthorize("@ss.hasPermi('majorpilot:student:sensitive')") Object sensitiveStudent(@PathVariable String id,@RequestBody OperationsDtos.SensitiveView input,HttpServletRequest r){return ApiResponses.success(r,service.sensitiveStudent(operator(),id,input,ApiResponses.requestId(r)));}
    @GetMapping("/experience-runs") @PreAuthorize("@ss.hasPermi('majorpilot:experience:view')") Object runs(@RequestParam Map<String,String> q,HttpServletRequest r){return ApiResponses.success(r,service.runs(operator(),OperationsQuery.parse(q).withoutReportType()));}
    @GetMapping("/experience-runs/{id}") @PreAuthorize("@ss.hasPermi('majorpilot:experience:view')") Object run(@PathVariable String id,HttpServletRequest r){return ApiResponses.success(r,service.runDetail(operator(),id));}
    @PostMapping("/experience-runs/{id}/sensitive-view") @PreAuthorize("@ss.hasPermi('majorpilot:experience:sensitive')") Object sensitiveRun(@PathVariable String id,@RequestBody OperationsDtos.SensitiveView input,HttpServletRequest r){return ApiResponses.success(r,service.sensitiveRun(operator(),id,input,ApiResponses.requestId(r)));}
    @GetMapping("/reports/page") @PreAuthorize("@ss.hasPermi('majorpilot:report:view')") Object reports(@RequestParam Map<String,String> q,HttpServletRequest r){return ApiResponses.success(r,service.reports(operator(),OperationsQuery.parse(q)));}
    @GetMapping("/task-versions/page") @PreAuthorize("@ss.hasPermi('majorpilot:task:view')") Object tasks(@RequestParam Map<String,String> q,HttpServletRequest r){return ApiResponses.success(r,service.tasks(operator(),OperationsQuery.parse(q).withoutReportType()));}
    @GetMapping("/task-versions/{id}/review-context") @PreAuthorize("@ss.hasPermi('majorpilot:task:view')") Object reviewContext(@PathVariable String id,HttpServletRequest r){return ApiResponses.success(r,service.taskReviewContext(operator(),id));}
    @GetMapping("/audit-events") @PreAuthorize("@ss.hasPermi('majorpilot:audit:view')") Object audit(@RequestParam Map<String,String> q,HttpServletRequest r){return ApiResponses.success(r,service.audits(operator(),OperationsQuery.parse(q).withoutReportType()));}
}
