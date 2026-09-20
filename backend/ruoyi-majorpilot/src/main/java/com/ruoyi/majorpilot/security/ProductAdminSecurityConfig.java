package com.ruoyi.majorpilot.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.framework.security.filter.JwtAuthenticationTokenFilter;
import com.ruoyi.majorpilot.shared.ApiException;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

/** Versioned product-admin APIs keep upstream JWT identity, but use the product error contract. */
@Configuration @Profile("local")
public class ProductAdminSecurityConfig {
    @Bean @Order(3)
    SecurityFilterChain productAdmin(HttpSecurity http,JwtAuthenticationTokenFilter jwt,ObjectMapper mapper) throws Exception {
        return http.securityMatcher("/api/admin/v1/majorpilot/**")
            .csrf(c->c.disable()).requestCache(c->c.disable()).logout(c->c.disable())
            .sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(c->c
                .authenticationEntryPoint((req,res,error)->StudentSecurityConfig.fail(mapper,req,res,new ApiException(401,"AUTH_REQUIRED")))
                .accessDeniedHandler((req,res,error)->StudentSecurityConfig.fail(mapper,req,res,new ApiException(403,"PERMISSION_DENIED"))))
            .authorizeHttpRequests(c->c.anyRequest().access((authentication,context)->new AuthorizationDecision(
                authentication.get().isAuthenticated()&&authentication.get().getPrincipal() instanceof LoginUser)))
            .addFilterBefore(jwt,UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(new Metadata(),JwtAuthenticationTokenFilter.class)
            .build();
    }
    private static class Metadata extends OncePerRequestFilter {
        @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
            res.setHeader("X-Request-Id",ApiResponses.requestId(req));res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");chain.doFilter(req,res);
        }
    }
}
