package com.ruoyi.majorpilot.shared;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.*;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
@RestControllerAdvice(basePackages="com.ruoyi.majorpilot") @Profile("local") @Order(-200)
public class ApiErrors {
    private static final Logger LOG=LoggerFactory.getLogger(ApiErrors.class);
    @ExceptionHandler(ApiException.class) public ResponseEntity<?> rejected(ApiException failure,HttpServletRequest req) { return ResponseEntity.status(failure.status).body(ApiResponses.error(req,failure)); }
    @ExceptionHandler(com.ruoyi.majorpilot.report.core.ReportInputException.class) public ResponseEntity<?> reportInput(com.ruoyi.majorpilot.report.core.ReportInputException failure,HttpServletRequest req){return rejected(new ApiException(409,failure.code),req);}
    @ExceptionHandler(HttpMessageNotReadableException.class) public ResponseEntity<?> malformed(HttpServletRequest req) { return rejected(new ApiException(400,"VALIDATION_ERROR"),req); }
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class) public ResponseEntity<?> forbidden(HttpServletRequest req) { return rejected(new ApiException(403,"PERMISSION_DENIED"),req); }
    @ExceptionHandler(Exception.class) public ResponseEntity<?> unexpected(Exception failure,HttpServletRequest req) { LOG.warn("request_id={} error_class={}",ApiResponses.requestId(req),failure.getClass().getSimpleName());return rejected(new ApiException(500,"INTERNAL_ERROR"),req); }
}
