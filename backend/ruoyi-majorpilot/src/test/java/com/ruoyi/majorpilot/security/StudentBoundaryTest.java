package com.ruoyi.majorpilot.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.auth.StudentSessions;
import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.Cookie;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StudentBoundaryTest {
    final StudentSessions sessions=mock(StudentSessions.class);
    final CsrfService csrf=new CsrfService(new Secrets("synthetic-test-secret-".repeat(3)));
    final ObjectMapper mapper=new ObjectMapper();
    @AfterEach void clearContext(){SecurityContextHolder.clearContext();}
    MockHttpServletRequest request(String method,String path){var request=new MockHttpServletRequest(method,path);request.setRemoteAddr("127.0.0.1");request.setContentType("application/json");request.addHeader("Origin","http://localhost:15173");return request;}
    MockHttpServletResponse run(boolean student,MockHttpServletRequest request,boolean expectedChain)throws Exception{var response=new MockHttpServletResponse();var called=new AtomicBoolean();new StudentSecurityConfig.Boundary(student,sessions,csrf,mapper,"http://localhost:15173").doFilter(request,response,(req,res)->called.set(true));assertEquals(expectedChain,called.get());assertNotNull(response.getHeader("X-Request-Id"));assertEquals("no-store",response.getHeader("Cache-Control"));return response;}
    void assertError(MockHttpServletResponse response,int status,String code)throws Exception{assertEquals(status,response.getStatus());assertEquals(code,mapper.readTree(response.getContentAsString()).path("error").path("code").asText());}
    void publicToken(MockHttpServletRequest request,String intake){String binding=intake==null?null:Secrets.hash(intake);String token=csrf.publicToken(request,new MockHttpServletResponse(),binding);request.setCookies(intake==null?new Cookie[]{new Cookie("MP_PUBLIC_CSRF",token)}:new Cookie[]{new Cookie("MP_PUBLIC_CSRF",token),new Cookie("MP_INTAKE",intake)});request.addHeader("X-CSRF-Token",token);}

    @Test void p0IdentitiesAreNotAvailableInLocalEvenWithoutAuthentication()throws Exception{assertError(run(false,request("GET","/api/public/v1/p0/health"),false),404,"RESOURCE_NOT_FOUND");assertError(run(true,request("GET","/api/app/v1/p0/me"),false),404,"RESOURCE_NOT_FOUND");verifyNoInteractions(sessions);}
    @Test void publicWritesRequireExactOriginAndJsonEvenWhenTokenIsValid()throws Exception{var wrongOrigin=request("POST","/api/public/v1/auth/login");publicToken(wrongOrigin,null);wrongOrigin.removeHeader("Origin");wrongOrigin.addHeader("Origin","http://localhost:15174");assertError(run(false,wrongOrigin,false),403,"CSRF_INVALID");var wrongMedia=request("POST","/api/public/v1/auth/login");publicToken(wrongMedia,null);wrongMedia.setContentType("text/plain");assertError(run(false,wrongMedia,false),415,"JSON_REQUIRED");}
    @Test void publicCookieTamperingAndIntakeBindingFailClosed()throws Exception{var request=request("POST","/api/public/v1/intake-sessions");publicToken(request,"original-intake");Cookie original=request.getCookies()[0];request.setCookies(original,new Cookie("MP_INTAKE","different-intake"));assertError(run(false,request,false),403,"CSRF_INVALID");}
    @Test void studentAuthenticationDoesNotAcceptAnAdminBearer()throws Exception{var request=request("GET","/api/app/v1/me");request.addHeader("Authorization","Bearer synthetic-operator-token");when(sessions.authenticate(null)).thenThrow(new ApiException(401,"AUTH_REQUIRED"));assertError(run(true,request,false),401,"AUTH_REQUIRED");verify(sessions).authenticate(null);}
    @Test void unverifiedStudentHasOnlyAccountAssistanceScope()throws Exception{when(sessions.authenticate("student-session")).thenReturn(new StudentPrincipal(1,"01SYNTHETICSTUDENTIDENTITY00","PENDING_VERIFICATION"));var me=request("GET","/api/app/v1/me");me.setCookies(new Cookie("MP_SESSION","student-session"));assertEquals(200,run(true,me,true).getStatus());var dashboard=request("GET","/api/app/v1/dashboard");dashboard.setCookies(new Cookie("MP_SESSION","student-session"));assertError(run(true,dashboard,false),403,"EMAIL_NOT_VERIFIED");}
    @Test void studentWritesRequireSessionBoundCsrfNotPublicCsrf()throws Exception{when(sessions.authenticate("student-session")).thenReturn(new StudentPrincipal(1,"01SYNTHETICSTUDENTIDENTITY00","ACTIVE"));var request=request("POST","/api/app/v1/auth/logout");String token=csrf.publicToken(request,new MockHttpServletResponse(),null);request.setCookies(new Cookie("MP_SESSION","student-session"),new Cookie("MP_CSRF",token));request.addHeader("X-CSRF-Token",token);assertError(run(true,request,false),403,"CSRF_INVALID");var valid=request("POST","/api/app/v1/auth/logout");String validToken=csrf.studentToken(valid,new MockHttpServletResponse(),Secrets.hash("student-session"));valid.setCookies(new Cookie("MP_SESSION","student-session"),new Cookie("MP_CSRF",validToken));valid.addHeader("X-CSRF-Token",validToken);assertEquals(200,run(true,valid,true).getStatus());}
}
