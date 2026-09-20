package com.ruoyi.majorpilot.shared;
import jakarta.servlet.http.*;
import java.util.*;
import java.time.Instant;
import org.springframework.http.ResponseCookie;
public final class ApiResponses {
    private ApiResponses() {}
    public static String requestId(HttpServletRequest req) { Object value=req.getAttribute("mp.requestId");if(value==null){value=UUID.randomUUID().toString();req.setAttribute("mp.requestId",value);}return value.toString(); }
    public static Map<String,Object> success(HttpServletRequest req,Object data) { return Map.of("data",data,"meta",Map.of("requestId",requestId(req),"apiVersion","v1")); }
    public static Map<String,Object> error(HttpServletRequest req,ApiException failure) { Map<String,Object> error=new LinkedHashMap<>(Map.of("code",failure.code,"message","Request could not be completed","fieldErrors",failure.fieldErrors,"retryable",failure.status==429||failure.status==503||failure.code.equals("REQUEST_IN_PROGRESS")));if(!failure.details.isEmpty())error.put("details",failure.details);return Map.of("error",error,"meta",Map.of("requestId",requestId(req))); }
    public static StudentPrincipal student(HttpServletRequest req) { Object principal=req.getAttribute("mp.student");if(!(principal instanceof StudentPrincipal student))throw new ApiException(401,"AUTH_REQUIRED");return student; }
    public static String cookie(HttpServletRequest req,String name) { if(req.getCookies()!=null)for(Cookie cookie:req.getCookies())if(cookie.getName().equals(name))return cookie.getValue();return null; }
    public static String intakeSecretHash(HttpServletRequest req) { String secret=cookie(req,"MP_INTAKE");if(secret==null||secret.length()>128)throw new ApiException(401,"AUTH_REQUIRED");return Secrets.hash(secret); }
    public static void setCookie(HttpServletResponse res,String name,String value,String path,boolean httpOnly,long maxAge) { res.addHeader("Set-Cookie",ResponseCookie.from(name,value).path(path).httpOnly(httpOnly).secure(false).sameSite("Lax").maxAge(maxAge).build().toString()); }
    public static void clearStudent(HttpServletResponse res) { setCookie(res,"MP_SESSION","","/api/app/v1",true,0);setCookie(res,"MP_CSRF","","/",false,0); }
    public static void clearIntake(HttpServletResponse res) { setCookie(res,"MP_INTAKE","","/api/public/v1",true,0);setCookie(res,"MP_PUBLIC_CSRF","","/",false,0); }
    public static void setIntakeCookie(HttpServletResponse res,String secret,Instant expiresAt) { setCookie(res,"MP_INTAKE",secret,"/api/public/v1",true,Math.max(0,expiresAt.getEpochSecond()-Instant.now().getEpochSecond())); }
}
