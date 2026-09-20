package com.ruoyi.majorpilot.shared;
import java.util.List;
import java.util.Map;
public final class ApiException extends RuntimeException {
    public final int status; public final String code; public final List<?> fieldErrors;public final Map<String,Object> details;
    public ApiException(int status,String code) { this(status,code,List.of()); }
    public ApiException(int status,String code,List<?> fieldErrors) { super(code);this.status=status;this.code=code;this.fieldErrors=fieldErrors;this.details=Map.of(); }
    public ApiException(int status,String code,Map<String,Object> details) { super(code);this.status=status;this.code=code;this.fieldErrors=List.of();this.details=details; }
}
