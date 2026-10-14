package com.ruoyi.majorpilot.report;
import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController @Profile({"local","pilot"})
public class FeedbackController {
    private final FeedbackService service;public FeedbackController(FeedbackService service){this.service=service;}
    @PostMapping("/api/app/v1/feedback") Object submit(@RequestBody ReportDtos.Feedback input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ResponseEntity.status(201).body(ApiResponses.success(req,service.submit(ApiResponses.student(req),key,input)));}
}
