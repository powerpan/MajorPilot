package com.ruoyi.majorpilot.p0;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.ResponseCookie;

public final class P0Http {
    public static final String PUBLIC = "/api/public/v1";
    public static final String APP = "/api/app/v1";
    private static final ObjectMapper JSON = new ObjectMapper();
    private P0Http() {}
    public static String cookie(HttpServletRequest request, String name) {
        if (request.getCookies() != null) for (Cookie cookie : request.getCookies()) if (name.equals(cookie.getName())) return cookie.getValue();
        return null;
    }
    public static String requestId(HttpServletRequest request) {
        Object id = request.getAttribute("mp.requestId");
        if (id == null) { id = UUID.randomUUID().toString(); request.setAttribute("mp.requestId", id); }
        return id.toString();
    }
    public static Map<String,Object> success(HttpServletRequest req, Object data) {
        return Map.of("data", data, "meta", Map.of("requestId", requestId(req), "apiVersion", "v1"));
    }
    public static Map<String,Object> error(HttpServletRequest req, String code, String message) {
        return Map.of("error", Map.of("code", code, "message", message, "fieldErrors", List.of(), "retryable", false), "meta", Map.of("requestId", requestId(req)));
    }
    public static void fail(HttpServletRequest req, HttpServletResponse res, int status, String code) throws IOException {
        res.setStatus(status); res.setContentType("application/json;charset=UTF-8");
        res.setHeader("X-Request-Id", requestId(req)); JSON.writeValue(res.getWriter(), error(req,code,"P0 request rejected"));
    }
    public static void setCookie(HttpServletResponse response, String name, String value, String path, boolean httpOnly, long seconds) {
        // This utility is reachable only in the loopback p0 profile. Production must enable Secure.
        response.addHeader("Set-Cookie", ResponseCookie.from(name,value).path(path).httpOnly(httpOnly).secure(false).sameSite("Lax").maxAge(Duration.ofSeconds(seconds)).build().toString());
    }
    public static void clearSession(HttpServletResponse response) { setCookie(response,"MP_SESSION","",APP,true,0); setCookie(response,"MP_CSRF","","/",false,0); }
    public static final class Rejected extends RuntimeException {
        public final int status; public final String code;
        public Rejected(int status, String code) { super(code); this.status=status; this.code=code; }
    }
}
