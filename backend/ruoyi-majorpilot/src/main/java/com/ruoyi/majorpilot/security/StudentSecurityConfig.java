package com.ruoyi.majorpilot.security;
import com.ruoyi.majorpilot.auth.StudentSessions;
import com.ruoyi.majorpilot.shared.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
@Configuration @Profile("local")
public class StudentSecurityConfig {
    @Bean @Order(1) SecurityFilterChain productPublic(HttpSecurity http,StudentSessions sessions,CsrfService csrf,ObjectMapper mapper,@Value("${MP_STUDENT_ORIGIN:http://localhost:15173}")String origin) throws Exception { return base(http,mapper).securityMatcher("/api/public/v1/**").authorizeHttpRequests(a->a.anyRequest().permitAll()).addFilterBefore(new Boundary(false,sessions,csrf,mapper,origin),UsernamePasswordAuthenticationFilter.class).build(); }
    @Bean @Order(2) SecurityFilterChain productStudent(HttpSecurity http,StudentSessions sessions,CsrfService csrf,ObjectMapper mapper,@Value("${MP_STUDENT_ORIGIN:http://localhost:15173}")String origin) throws Exception { return base(http,mapper).securityMatcher("/api/app/v1/**").authorizeHttpRequests(a->a.anyRequest().hasAuthority("STUDENT")).addFilterBefore(new Boundary(true,sessions,csrf,mapper,origin),UsernamePasswordAuthenticationFilter.class).build(); }
    private HttpSecurity base(HttpSecurity http,ObjectMapper mapper) throws Exception { return http.csrf(c->c.disable()).requestCache(c->c.disable()).logout(c->c.disable()).sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).exceptionHandling(c->c.authenticationEntryPoint((req,res,e)->fail(mapper,req,res,new ApiException(401,"AUTH_REQUIRED"))).accessDeniedHandler((req,res,e)->fail(mapper,req,res,new ApiException(403,"PERMISSION_DENIED")))); }
    static void fail(ObjectMapper mapper,HttpServletRequest req,HttpServletResponse res,ApiException error) throws IOException { res.setStatus(error.status);res.setContentType("application/json;charset=UTF-8");mapper.writeValue(res.getOutputStream(),ApiResponses.error(req,error)); }
    static final class Boundary extends OncePerRequestFilter {
        final boolean student;final StudentSessions sessions;final CsrfService csrf;final ObjectMapper mapper;final String origin;
        Boundary(boolean student,StudentSessions sessions,CsrfService csrf,ObjectMapper mapper,String origin) { this.student=student;this.sessions=sessions;this.csrf=csrf;this.mapper=mapper;this.origin=origin; }
        @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain)throws ServletException,IOException {
            res.setHeader("X-Request-Id",ApiResponses.requestId(req));res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");
            try {
                if(!Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(req.getRemoteAddr()))throw new ApiException(403,"LOCAL_ONLY");
                String path=req.getRequestURI();if(path.startsWith("/api/public/v1/p0/")||path.startsWith("/api/app/v1/p0/"))throw new ApiException(404,"RESOURCE_NOT_FOUND");
                String session=ApiResponses.cookie(req,"MP_SESSION");
                if(student) {
                    var principal=sessions.authenticate(session);req.setAttribute("mp.student",principal);
                    SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal,null,List.of(new SimpleGrantedAuthority("STUDENT"))));
                    if(!principal.status().equals("ACTIVE")&&!pendingAccountPath(path))throw new ApiException(403,"EMAIL_NOT_VERIFIED");
                }
                boolean download=student&&path.matches("/api/app/v1/data-export-requests/[0-7][0-9A-HJKMNP-TV-Z]{25}/download");
                if(download||!Set.of("GET","HEAD","OPTIONS").contains(req.getMethod())) {
                    if(!download&&(req.getContentType()==null||!req.getContentType().split(";",2)[0].trim().equalsIgnoreCase("application/json")))throw new ApiException(415,"JSON_REQUIRED");
                    String cookie=ApiResponses.cookie(req,student?"MP_CSRF":"MP_PUBLIC_CSRF"),intake=ApiResponses.cookie(req,"MP_INTAKE");
                    String binding=student?Secrets.hash(session):intake==null?null:Secrets.hash(intake);
                    // Browsers omit Origin on same-origin GET. Fetch metadata is the narrow
                    // fallback for this one private download; all writes still require Origin.
                    boolean sameOrigin=origin.equals(req.getHeader("Origin"))||(download&&req.getHeader("Origin")==null&&"same-origin".equals(req.getHeader("Sec-Fetch-Site")));
                    if(!sameOrigin||!Secrets.equal(cookie,req.getHeader("X-CSRF-Token"))||!csrf.valid(cookie,student?"student":"public",binding))throw new ApiException(403,"CSRF_INVALID");
                }
                chain.doFilter(req,res);
            } catch(ApiException rejected) { fail(mapper,req,res,rejected); }
        }
        static boolean pendingAccountPath(String path){
            return Set.of("/api/app/v1/me","/api/app/v1/auth/csrf","/api/app/v1/auth/logout","/api/app/v1/consents","/api/app/v1/consents/research/withdraw","/api/app/v1/me/password","/api/app/v1/me/email","/api/app/v1/me/email/confirm","/api/app/v1/data-export-requests","/api/app/v1/account-deletion-requests").contains(path)
                ||path.matches("/api/app/v1/data-export-requests/[0-7][0-9A-HJKMNP-TV-Z]{25}(/download)?")
                ||path.matches("/api/app/v1/account-deletion-requests/[0-7][0-9A-HJKMNP-TV-Z]{25}(/confirm)?");
        }
    }
}
