package com.ruoyi.majorpilot.privacy;

import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.*;
import java.time.Instant;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @Profile("local")
public class PrivacyController {
    public static final String RECEIPT_PATH="/api/public/v1/deletion-receipts";
    private final PrivacyService service;
    public PrivacyController(PrivacyService service){this.service=service;}
    @PostMapping("/api/app/v1/data-export-requests") public Object export(@RequestBody PrivacyDtos.ExportRequest body,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ResponseEntity.accepted().body(ApiResponses.success(req,service.requestExport(ApiResponses.student(req),body,key)));}
    @GetMapping("/api/app/v1/data-export-requests") public Object exports(HttpServletRequest req){return ApiResponses.success(req,Map.of("items",service.exports(ApiResponses.student(req))));}
    @GetMapping("/api/app/v1/data-export-requests/{id}") public Object exportStatus(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,service.exportStatus(ApiResponses.student(req),id));}
    @GetMapping("/api/app/v1/data-export-requests/{id}/download") public ResponseEntity<byte[]> download(@PathVariable String id,HttpServletRequest req){byte[] bytes=service.download(ApiResponses.student(req),id);return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip")).header("Content-Disposition","attachment; filename=\"majorpilot-personal-export.zip\"").header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff").body(bytes);}
    @PostMapping("/api/app/v1/account-deletion-requests") public Object deletion(@RequestBody Map<String,Object> body,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req,HttpServletResponse res){if(!body.isEmpty())throw new ApiException(422,"VALIDATION_ERROR");var issued=service.requestDeletion(ApiResponses.student(req),key);ApiResponses.setCookie(res,"MP_DELETION",issued.secret(),RECEIPT_PATH,true,127L*86400);return ResponseEntity.status(201).body(ApiResponses.success(req,issued.status()));}
    @GetMapping("/api/app/v1/account-deletion-requests/{id}") public Object deletionStatus(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,service.deletionStatus(ApiResponses.student(req),id));}
    @PostMapping("/api/app/v1/account-deletion-requests/{id}/confirm") public Object confirm(@PathVariable String id,@RequestBody PrivacyDtos.DeletionConfirm body,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req,HttpServletResponse res){var status=service.confirmDeletion(ApiResponses.student(req),id,body,key);ApiResponses.clearStudent(res);return ResponseEntity.accepted().body(ApiResponses.success(req,status));}
    @GetMapping(RECEIPT_PATH+"/{id}") public Object receipt(@PathVariable String id,HttpServletRequest req,HttpServletResponse res){
        String secret=ApiResponses.cookie(req,"MP_DELETION");
        try{var receipt=service.receipt(id,secret);ApiResponses.setCookie(res,"MP_DELETION",secret,RECEIPT_PATH,true,Math.max(0,receipt.expiresAt().getEpochSecond()-Instant.now().getEpochSecond()));return ApiResponses.success(req,receipt);}
        catch(ApiException invalid){if(invalid.status==404)ApiResponses.setCookie(res,"MP_DELETION","",RECEIPT_PATH,true,0);throw invalid;}
    }
}
