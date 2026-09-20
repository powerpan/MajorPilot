package com.ruoyi.majorpilot.p0;

import java.io.IOException;
import java.util.List;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration @Profile("p0")
public class P0SecurityConfig {
    @Bean P0Crypto p0Crypto(@Value("${MP_CSRF_SECRET}") String secret) { return new P0Crypto(secret); }
    @Bean @Order(1) SecurityFilterChain p0Public(HttpSecurity http, P0IdentityStore identities,P0Crypto crypto,@Value("${MP_STUDENT_ORIGIN:http://localhost:15173}") String origin) throws Exception {
        return base(http).securityMatcher("/api/public/v1/**")
            .authorizeHttpRequests(a->a.anyRequest().permitAll())
            .addFilterBefore(new BoundaryFilter(false,identities,crypto,origin),UsernamePasswordAuthenticationFilter.class).build();
    }
    @Bean @Order(2) SecurityFilterChain p0Student(HttpSecurity http,P0IdentityStore identities,P0Crypto crypto,@Value("${MP_STUDENT_ORIGIN:http://localhost:15173}") String origin) throws Exception {
        return base(http).securityMatcher("/api/app/v1/**")
            .authorizeHttpRequests(a->a.anyRequest().hasAuthority("P0_STUDENT"))
            .addFilterBefore(new BoundaryFilter(true,identities,crypto,origin),UsernamePasswordAuthenticationFilter.class).build();
    }
    private HttpSecurity base(HttpSecurity http) throws Exception {
        return http.csrf(c->c.disable()).requestCache(c->c.disable()).logout(c->c.disable())
            .sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(c->c.authenticationEntryPoint((req,res,e)->P0Http.fail(req,res,401,"AUTH_REQUIRED"))
                .accessDeniedHandler((req,res,e)->P0Http.fail(req,res,403,"ACCESS_DENIED")));
    }
    /** Separate filter instance per chain; never registered as a global servlet filter. */
    static final class BoundaryFilter extends OncePerRequestFilter {
        final boolean student; final P0IdentityStore identities; final P0Crypto crypto; final String origin;
        BoundaryFilter(boolean student,P0IdentityStore identities,P0Crypto crypto,String origin) { this.student=student;this.identities=identities;this.crypto=crypto;this.origin=origin; }
        @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
            res.setHeader("X-Request-Id",P0Http.requestId(req)); res.setHeader("Cache-Control","no-store");
            // Even a mistakenly relaxed server.address cannot expose P0 to non-loopback callers.
            if(!List.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(req.getRemoteAddr())) { P0Http.fail(req,res,403,"LOCAL_ONLY");return; }
            String session=P0Http.cookie(req,"MP_SESSION");
            if(student) {
                String actor=identities.authenticate(session);
                if(actor==null) { P0Http.fail(req,res,401,"AUTH_REQUIRED");return; }
                var auth=UsernamePasswordAuthenticationToken.authenticated(actor,null,List.of(new SimpleGrantedAuthority("P0_STUDENT")));
                SecurityContextHolder.getContext().setAuthentication(auth); req.setAttribute("mp.actor",actor);
            }
            if(!List.of("GET","HEAD","OPTIONS").contains(req.getMethod())) {
                String name=student?"MP_CSRF":"MP_PUBLIC_CSRF";
                String token=P0Http.cookie(req,name);
                String intake=P0Http.cookie(req,"MP_INTAKE");
                String binding=student?P0Crypto.hash(session):(intake==null?"anonymous":P0Crypto.hash(intake));
                if(!origin.equals(req.getHeader("Origin")) || !P0Crypto.equal(token,req.getHeader("X-CSRF-Token")) || !crypto.validCsrf(token,student?"student":"public",binding)) {
                    P0Http.fail(req,res,403,"CSRF_INVALID");return;
                }
            }
            chain.doFilter(req,res);
        }
    }
}
