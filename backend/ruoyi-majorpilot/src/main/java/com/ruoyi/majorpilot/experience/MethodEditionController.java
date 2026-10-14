package com.ruoyi.majorpilot.experience;

import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @Profile({"local","pilot"}) @RequestMapping("/api/app/v1")
public class MethodEditionController {
    private final RunService runs;
    public MethodEditionController(RunService runs){this.runs=runs;}
    @GetMapping("/experience-editions") Object editions(HttpServletRequest req){return ApiResponses.success(req,runs.editions(ApiResponses.student(req)));}
    @PostMapping("/experience-runs/{id}/new-edition") Object newEdition(@PathVariable String id,@RequestBody RunDtos.Revision input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ResponseEntity.status(201).body(ApiResponses.success(req,runs.newEdition(ApiResponses.student(req),id,key,input)));}
}
