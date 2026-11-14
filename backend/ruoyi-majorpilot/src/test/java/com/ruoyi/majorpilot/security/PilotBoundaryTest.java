package com.ruoyi.majorpilot.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.auth.StudentSessions;
import com.ruoyi.majorpilot.pilot.PilotAccess;
import com.ruoyi.majorpilot.shared.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PilotBoundaryTest {
    final PilotAccess pilot=mock(PilotAccess.class);final StudentSessions sessions=mock(StudentSessions.class);
    final ObjectMapper mapper=new ObjectMapper();final CsrfService csrf=new CsrfService(new Secrets("offline-synthetic-secret-".repeat(3)));
    @AfterEach void clear(){SecurityContextHolder.clearContext();RequestContextHolder.resetRequestAttributes();}
    MockHttpServletResponse call(boolean student,String path,boolean secure,boolean expected)throws Exception{
        var req=new MockHttpServletRequest("GET",path);req.setRemoteAddr("198.51.100.11");req.setSecure(secure);
        var res=new MockHttpServletResponse();var reached=new AtomicBoolean();
        new StudentSecurityConfig.Boundary(student,sessions,csrf,mapper,"https://student.example.org",pilot).doFilter(req,res,(a,b)->reached.set(true));assertEquals(expected,reached.get());return res;
    }
    @Test void pilotRequiresTlsAndBlocksEveryMailEntry()throws Exception{
        assertEquals(403,call(false,"/api/public/v1/auth/csrf",false,false).getStatus());
        for(String path:new String[]{"register","verify-email","verify-email/resend","password/forgot","password/reset"})assertEquals(404,call(false,"/api/public/v1/auth/"+path,true,false).getStatus());
        assertEquals(200,call(false,"/api/public/v1/auth/csrf",true,true).getStatus());
    }
    @Test void membersStillNeedConsentAndOtherAccountsAreRejected()throws Exception{
        when(sessions.authenticate(null)).thenReturn(new StudentPrincipal(7,PublicIds.next(),"ACTIVE"));
        assertEquals(403,call(true,"/api/app/v1/me",true,false).getStatus());when(pilot.isMember(7)).thenReturn(true);
        assertEquals(200,call(true,"/api/app/v1/me",true,true).getStatus());assertEquals(200,call(true,"/api/app/v1/pilot",true,true).getStatus());assertEquals(403,call(true,"/api/app/v1/dashboard",true,false).getStatus());
        when(pilot.consented(7)).thenReturn(true);assertEquals(200,call(true,"/api/app/v1/dashboard",true,true).getStatus());assertEquals(404,call(true,"/api/app/v1/me/email",true,false).getStatus());
    }
    @Test void skippingBackgroundDoesNotBypassPilotConsentOrEnablePublicRegistration()throws Exception{
        when(sessions.authenticate(null)).thenReturn(new StudentPrincipal(7,PublicIds.next(),"ACTIVE"));when(pilot.isMember(7)).thenReturn(true);
        for(String path:java.util.List.of("/api/app/v1/profile","/api/app/v1/profile/draft","/api/app/v1/profile/submit","/api/app/v1/experience-runs"))assertEquals(403,call(true,path,true,false).getStatus());
        assertEquals(404,call(false,"/api/public/v1/intake-sessions/synthetic/finish",true,false).getStatus());
        when(pilot.consented(7)).thenReturn(true);assertEquals(200,call(true,"/api/app/v1/profile",true,true).getStatus());
    }
    @Test void httpsCookiesAreSecureHostOnlyAndKeepLocalCompatibility(){
        var req=new MockHttpServletRequest();req.setSecure(true);RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));var res=new MockHttpServletResponse();
        ApiResponses.setCookie(res,"MP_SESSION","synthetic","/api/app/v1",true,600);String cookie=res.getHeader("Set-Cookie");assertTrue(cookie.contains("Secure"));assertTrue(cookie.contains("HttpOnly"));assertTrue(cookie.contains("SameSite=Lax"));assertFalse(cookie.contains("Domain="));
        RequestContextHolder.resetRequestAttributes();var local=new MockHttpServletResponse();ApiResponses.setCookie(local,"MP_SESSION","synthetic","/api/app/v1",true,600);assertFalse(local.getHeader("Set-Cookie").contains("Secure"));
    }
}
