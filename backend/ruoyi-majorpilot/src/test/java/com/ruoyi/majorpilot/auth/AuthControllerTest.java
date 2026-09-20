package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.security.CsrfService;
import com.ruoyi.majorpilot.shared.Secrets;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AuthControllerTest {
    @Test void successfulLoginClearsAnonymousCookiesWithoutClaimingOrDeletingData() {
        var auth=mock(AuthService.class);var sessions=mock(StudentSessions.class);
        var request=new MockHttpServletRequest("POST","/api/public/v1/auth/login");request.setRemoteAddr("127.0.0.1");request.setCookies(new Cookie("MP_INTAKE","synthetic-anonymous-secret"));
        var response=new MockHttpServletResponse();var body=new AuthDtos.Login("fixture@example.invalid","synthetic passphrase");
        when(auth.login(eq(body),eq("127.0.0.1"),anyString())).thenReturn(new AuthDtos.LoginResult(new AuthDtos.Me("01ARZ3NDEKTSV4RRFFQ69G5FAV","fixture@example.invalid","ACTIVE",true,true),"synthetic-session-secret"));
        new AuthController(auth,sessions,new CsrfService(new Secrets("synthetic-signing-key-".repeat(3)))).login(body,request,response);
        var cookies=response.getHeaders("Set-Cookie");
        assertTrue(cookies.stream().anyMatch(c->c.startsWith("MP_INTAKE=;")&&c.contains("Path=/api/public/v1")&&c.contains("Max-Age=0")&&c.contains("HttpOnly")));
        assertTrue(cookies.stream().anyMatch(c->c.startsWith("MP_PUBLIC_CSRF=;")&&c.contains("Path=/;")&&c.contains("Max-Age=0")));
        assertTrue(cookies.stream().anyMatch(c->c.startsWith("MP_SESSION=synthetic-session-secret;")&&c.contains("Path=/api/app/v1")&&c.contains("HttpOnly")));
        assertTrue(cookies.stream().anyMatch(c->c.startsWith("MP_CSRF=")&&!c.contains("Max-Age=0")));
        verify(auth).login(eq(body),eq("127.0.0.1"),anyString());verifyNoMoreInteractions(auth);verifyNoInteractions(sessions);
    }
}
