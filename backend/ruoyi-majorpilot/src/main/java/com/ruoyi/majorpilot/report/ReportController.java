package com.ruoyi.majorpilot.report;
import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController @Profile({"local","pilot"}) @RequestMapping("/api/app/v1")
public class ReportController {
    private final ReportService service;public ReportController(ReportService service){this.service=service;}
    @GetMapping("/reports") Object list(@RequestParam(required=false)String cursor,@RequestParam(required=false)Integer limit,HttpServletRequest req){return ApiResponses.success(req,service.list(ApiResponses.student(req),cursor,limit));}
    @GetMapping("/reports/{id}") Object get(@PathVariable String id,HttpServletRequest req){var data=service.get(ApiResponses.student(req),id,null);return ResponseEntity.status(data instanceof ReportDtos.Status?202:200).body(ApiResponses.success(req,data));}
    @GetMapping("/reports/{id}/status") Object status(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,service.status(ApiResponses.student(req),id));}
    @GetMapping("/reports/{id}/print") Object print(@PathVariable String id,@RequestParam(required=false)String expectedReportVersionId,HttpServletRequest req){if(expectedReportVersionId!=null&&!expectedReportVersionId.matches("[0-7][0-9A-HJKMNP-TV-Z]{25}"))throw new ApiException(422,"VALIDATION_ERROR");var data=service.get(ApiResponses.student(req),id,expectedReportVersionId);return ResponseEntity.status(data instanceof ReportDtos.Status?202:200).body(ApiResponses.success(req,data));}
    @GetMapping("/comparison-report") Object compare(HttpServletRequest req){return ApiResponses.success(req,service.comparison(ApiResponses.student(req)));}
}
