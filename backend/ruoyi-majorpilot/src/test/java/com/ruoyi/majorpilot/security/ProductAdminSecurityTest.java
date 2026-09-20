package com.ruoyi.majorpilot.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.framework.security.filter.JwtAuthenticationTokenFilter;
import com.ruoyi.framework.security.handle.AuthenticationEntryPointImpl;
import com.ruoyi.framework.web.service.TokenService;
import jakarta.servlet.http.Cookie;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.*;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ProductAdminSecurityTest {
    private static final String PATH="/api/admin/v1/majorpilot/experience-runs/00000000000000000000000001/recovery-runs";
    @Configuration @EnableWebMvc @EnableWebSecurity @Import(ProductAdminSecurityConfig.class)
    static class WebConfiguration {
        @Bean ObjectMapper mapper(){return new ObjectMapper();}
        @Bean JwtAuthenticationTokenFilter jwt(){return new JwtAuthenticationTokenFilter();}
        // Preserve the actual upstream error renderer on the lower-priority legacy boundary.
        @Bean @Order(100) SecurityFilterChain legacy(HttpSecurity http) throws Exception {
            return http.csrf(c->c.disable()).sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(c->c.authenticationEntryPoint(new AuthenticationEntryPointImpl()))
                .authorizeHttpRequests(c->c.anyRequest().authenticated()).build();
        }
    }
    private AnnotationConfigWebApplicationContext context(){
        var context=new AnnotationConfigWebApplicationContext();context.setServletContext(new MockServletContext());
        context.setEnvironment(new MockEnvironment());context.getEnvironment().setActiveProfiles("local");
        // Supply the token-store boundary as an existing singleton: never initialize Redis or secrets.
        context.addBeanFactoryPostProcessor(factory->factory.registerSingleton("tokenService",mock(TokenService.class)));
        context.register(WebConfiguration.class);context.refresh();return context;
    }
    private MockHttpServletRequest request(String path){var request=new MockHttpServletRequest("POST",path);request.setServletPath(path);request.setRemoteAddr("127.0.0.1");request.setContentType("application/json");request.setContent("{}".getBytes(java.nio.charset.StandardCharsets.UTF_8));return request;}
    @Test void studentCookieCannotAuthenticateProductAdminAndReceivesReal401Envelope() throws Exception {
        try(var context=context()){
            var request=request(PATH);request.setCookies(new Cookie("MP_SESSION","synthetic-student-session"));var response=new MockHttpServletResponse();var reached=new AtomicBoolean();
            context.getBean(FilterChainProxy.class).doFilter(request,response,(req,res)->reached.set(true));
            assertFalse(reached.get());assertEquals(401,response.getStatus());var body=context.getBean(ObjectMapper.class).readTree(response.getContentAsByteArray());
            assertEquals("AUTH_REQUIRED",body.path("error").path("code").asText());assertTrue(body.path("error").path("fieldErrors").isArray());assertFalse(body.path("error").path("retryable").asBoolean());
            assertEquals(response.getHeader("X-Request-Id"),body.path("meta").path("requestId").asText());assertFalse(body.has("code"));
        }
    }
    @Test void authenticatedOperatorPermissionDenialUsesReal403Envelope() throws Exception {
        try(var context=context()){
            when(context.getBean(TokenService.class).getLoginUser(any())).thenReturn(new LoginUser());
            var response=new MockHttpServletResponse();var reached=new AtomicBoolean();
            context.getBean(FilterChainProxy.class).doFilter(request(PATH),response,(req,res)->{reached.set(true);throw new AccessDeniedException("synthetic denied permission");});
            assertTrue(reached.get());assertEquals(403,response.getStatus());var body=context.getBean(ObjectMapper.class).readTree(response.getContentAsByteArray());
            assertEquals("PERMISSION_DENIED",body.path("error").path("code").asText());assertEquals(response.getHeader("X-Request-Id"),body.path("meta").path("requestId").asText());
        }
    }
    @Test void legacyAdministratorAjaxRendererIsNotChanged() throws Exception {
        try(var context=context()){
            var response=new MockHttpServletResponse();context.getBean(FilterChainProxy.class).doFilter(request("/system/menu/list"),response,(req,res)->fail("anonymous legacy request must not reach handler"));
            var body=context.getBean(ObjectMapper.class).readTree(response.getContentAsByteArray());assertEquals(401,body.path("code").asInt());assertFalse(body.has("error"));
        }
    }
}
