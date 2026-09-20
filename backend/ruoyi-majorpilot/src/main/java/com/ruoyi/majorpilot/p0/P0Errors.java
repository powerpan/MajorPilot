package com.ruoyi.majorpilot.p0;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(basePackages="com.ruoyi.majorpilot.p0") @Profile("p0") @Order(-100)
public class P0Errors {
    @ExceptionHandler(P0Http.Rejected.class) public ResponseEntity<?> reject(P0Http.Rejected e,HttpServletRequest request) { return ResponseEntity.status(e.status).body(P0Http.error(request,e.code,"P0 request rejected")); }
    @ExceptionHandler(HttpMessageNotReadableException.class) public ResponseEntity<?> malformed(HttpServletRequest request) { return ResponseEntity.badRequest().body(P0Http.error(request,"VALIDATION_ERROR","Malformed or unknown request field")); }
    @ExceptionHandler(Exception.class) public ResponseEntity<?> internal(HttpServletRequest request) { return ResponseEntity.internalServerError().body(P0Http.error(request,"INTERNAL_ERROR","P0 operation failed")); }
}
