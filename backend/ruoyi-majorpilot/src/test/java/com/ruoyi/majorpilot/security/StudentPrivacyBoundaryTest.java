package com.ruoyi.majorpilot.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.auth.StudentSessions;
import com.ruoyi.majorpilot.shared.ApiException;
import com.ruoyi.majorpilot.shared.Secrets;
import com.ruoyi.majorpilot.shared.StudentPrincipal;
import jakarta.servlet.http.Cookie;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Executes the production filter, without a server, database or session implementation. */
class StudentPrivacyBoundaryTest {
    private static final String ORIGIN="http://localhost:15173";
    private static final String SESSION="synthetic-student-session";
    private static final String TOKEN="synthetic-session-bound-csrf";
    private static final String ID="01JTEST0000000000000000001";
    private static final String EXPORT="/api/app/v1/data-export-requests/"+ID;
    private static final String DELETION="/api/app/v1/account-deletion-requests/"+ID;
    private final StudentSessions sessions=mock(StudentSessions.class);
    private final CsrfService csrf=mock(CsrfService.class);
    private final ObjectMapper mapper=new ObjectMapper();

    @BeforeEach void configure(){
        principal("ACTIVE");
        when(csrf.valid(TOKEN,"student",Secrets.hash(SESSION))).thenReturn(true);
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    private void principal(String status){when(sessions.authenticate(SESSION)).thenReturn(new StudentPrincipal(42,ID,status));}
    private MockHttpServletRequest request(String method,String path){
        var request=new MockHttpServletRequest(method,path);
        request.setRemoteAddr("127.0.0.1");
        request.setCookies(new Cookie("MP_SESSION",SESSION));
        return request;
    }
    private void token(MockHttpServletRequest request){
        request.setCookies(new Cookie("MP_SESSION",SESSION),new Cookie("MP_CSRF",TOKEN));
        request.addHeader("X-CSRF-Token",TOKEN);
    }
    private MockHttpServletRequest write(String method,String path){
        var request=request(method,path);token(request);
        request.setContentType("application/json;charset=UTF-8");request.addHeader("Origin",ORIGIN);
        return request;
    }
    private MockHttpServletResponse run(MockHttpServletRequest request,boolean allowed)throws Exception{
        return run(request,allowed,csrf);
    }
    private MockHttpServletResponse run(MockHttpServletRequest request,boolean allowed,CsrfService csrfService)throws Exception{
        SecurityContextHolder.clearContext();
        var response=new MockHttpServletResponse();var chained=new AtomicBoolean();
        try{
            new StudentSecurityConfig.Boundary(true,sessions,csrfService,mapper,ORIGIN).doFilter(request,response,(req,res)->chained.set(true));
            assertEquals(allowed,chained.get(),request.getMethod()+" "+request.getRequestURI());
            assertEquals("no-store",response.getHeader("Cache-Control"));
            assertEquals("no-referrer",response.getHeader("Referrer-Policy"));
            assertNotNull(response.getHeader("X-Request-Id"));
            if(allowed){assertEquals(200,response.getStatus());assertEquals(0,response.getContentAsByteArray().length);}
            return response;
        }finally{SecurityContextHolder.clearContext();}
    }
    private void rejected(MockHttpServletRequest request,int status,String code)throws Exception{
        var response=run(request,false);assertEquals(status,response.getStatus());
        assertEquals(code,mapper.readTree(response.getContentAsByteArray()).path("error").path("code").asText());
        assertFalse(response.getContentAsString().contains(SESSION));
        assertFalse(response.getContentAsString().contains(TOKEN));
    }

    @Test void pendingStudentCanReadOwnAccountPrivacyRoutesWithoutOpeningTasks()throws Exception{
        principal("PENDING_VERIFICATION");
        for(String path:List.of("/api/app/v1/me","/api/app/v1/auth/csrf","/api/app/v1/consents","/api/app/v1/data-export-requests",EXPORT,DELETION))run(request("GET",path),true);
        verifyNoInteractions(csrf);
    }
    @Test void pendingStudentCanSubmitSettingsExportsDeletionAndExistingAccountAssistance()throws Exception{
        principal("PENDING_VERIFICATION");
        for(String path:List.of("/api/app/v1/me/email","/api/app/v1/me/password"))run(write("PATCH",path),true);
        for(String path:List.of("/api/app/v1/me/email/confirm","/api/app/v1/data-export-requests","/api/app/v1/account-deletion-requests",DELETION+"/confirm","/api/app/v1/consents/research/withdraw","/api/app/v1/auth/logout"))run(write("POST",path),true);
        verify(csrf,times(8)).valid(TOKEN,"student",Secrets.hash(SESSION));
    }
    @Test void pendingScopeIsExactAndDoesNotOpenTasksEventsOrNestedLookalikes()throws Exception{
        principal("PENDING_VERIFICATION");
        for(String path:List.of("/api/app/v1/dashboard","/api/app/v1/experience-runs/"+ID,"/api/app/v1/me/tasks",EXPORT+"/anything",DELETION+"/confirm/extra","/api/app/v1/data-export-requests/not-an-id","/api/app/v1/account-deletion-requests/"+ID.toLowerCase()))rejected(request("GET",path),403,"EMAIL_NOT_VERIFIED");
        rejected(write("POST","/api/app/v1/experience-runs"),403,"EMAIL_NOT_VERIFIED");
        rejected(write("PUT","/api/app/v1/profile/draft"),403,"EMAIL_NOT_VERIFIED");
        rejected(write("POST","/api/app/v1/profile/submit"),403,"EMAIL_NOT_VERIFIED");
        rejected(write("POST","/api/app/v1/events"),403,"EMAIL_NOT_VERIFIED");
        verifyNoInteractions(csrf);
    }
    @Test void pendingStudentCanDownloadWithBoundCsrfAndExactOrigin()throws Exception{
        principal("PENDING_VERIFICATION");var request=request("GET",EXPORT+"/download");token(request);request.addHeader("Origin",ORIGIN);
        run(request,true);verify(csrf).valid(TOKEN,"student",Secrets.hash(SESSION));
    }
    @Test void downloadWithoutOriginNeedsExactlySameOriginFetchMetadata()throws Exception{
        for(String metadata:List.of("","cross-site","same-site","none","same-origin, cross-site")){
            var request=request("GET",EXPORT+"/download");token(request);
            if(!metadata.isEmpty())request.addHeader("Sec-Fetch-Site",metadata);
            rejected(request,403,"CSRF_INVALID");
        }
        verifyNoInteractions(csrf);
    }
    @Test void sameOriginFetchMetadataAllowsBrowserGetWithoutOriginButStillChecksBinding()throws Exception{
        var request=request("GET",EXPORT+"/download");token(request);request.addHeader("Sec-Fetch-Site","same-origin");
        run(request,true);verify(csrf).valid(TOKEN,"student",Secrets.hash(SESSION));
    }
    @Test void exactOriginIsSufficientWithoutFetchMetadataOrGetContentType()throws Exception{
        var request=request("GET",EXPORT+"/download");token(request);request.addHeader("Origin",ORIGIN);
        assertNull(request.getContentType());run(request,true);
    }
    @Test void explicitCrossOriginCannotUseSameOriginMetadataAsAnOverride()throws Exception{
        for(String origin:List.of("http://localhost:15174","https://untrusted.invalid","null","http://localhost:15173/")){
            var request=request("GET",EXPORT+"/download");token(request);request.addHeader("Origin",origin);request.addHeader("Sec-Fetch-Site","same-origin");
            rejected(request,403,"CSRF_INVALID");
        }
        verifyNoInteractions(csrf);
    }
    @Test void downloadMissingCsrfCookieOrHeaderAndMismatchedValuesAreRejected()throws Exception{
        var missingBoth=request("GET",EXPORT+"/download");missingBoth.addHeader("Origin",ORIGIN);rejected(missingBoth,403,"CSRF_INVALID");
        var missingHeader=request("GET",EXPORT+"/download");token(missingHeader);missingHeader.removeHeader("X-CSRF-Token");missingHeader.addHeader("Origin",ORIGIN);rejected(missingHeader,403,"CSRF_INVALID");
        var missingCookie=request("GET",EXPORT+"/download");missingCookie.addHeader("X-CSRF-Token",TOKEN);missingCookie.addHeader("Origin",ORIGIN);rejected(missingCookie,403,"CSRF_INVALID");
        var mismatch=request("GET",EXPORT+"/download");token(mismatch);mismatch.removeHeader("X-CSRF-Token");mismatch.addHeader("X-CSRF-Token","another-token");mismatch.addHeader("Origin",ORIGIN);rejected(mismatch,403,"CSRF_INVALID");
        verifyNoInteractions(csrf);
    }
    @Test void matchingCsrfValuesStillRequireServerValidation()throws Exception{
        when(csrf.valid(TOKEN,"student",Secrets.hash(SESSION))).thenReturn(false);
        var request=request("GET",EXPORT+"/download");token(request);request.addHeader("Sec-Fetch-Site","same-origin");
        rejected(request,403,"CSRF_INVALID");verify(csrf).valid(TOKEN,"student",Secrets.hash(SESSION));
    }
    @Test void realCsrfRejectsTokensForAnotherSessionEvenWithMatchingCookieAndHeader()throws Exception{
        var realCsrf=new CsrfService(new Secrets("synthetic-privacy-csrf-secret-".repeat(3)));
        var request=request("GET",EXPORT+"/download");
        String token=realCsrf.studentToken(request,new MockHttpServletResponse(),Secrets.hash("different-synthetic-session"));
        request.setCookies(new Cookie("MP_SESSION",SESSION),new Cookie("MP_CSRF",token));request.addHeader("X-CSRF-Token",token);request.addHeader("Origin",ORIGIN);
        var response=run(request,false,realCsrf);assertEquals(403,response.getStatus());assertEquals("CSRF_INVALID",mapper.readTree(response.getContentAsByteArray()).path("error").path("code").asText());
    }
    @Test void ordinaryAuthenticatedGetsKeepExistingNoCsrfRequirement()throws Exception{
        for(String path:List.of("/api/app/v1/me","/api/app/v1/data-export-requests",EXPORT,DELETION,"/api/app/v1/dashboard"))run(request("GET",path),true);
        verifyNoInteractions(csrf);
    }
    @Test void mutationsCannotUseFetchMetadataInPlaceOfExplicitOrigin()throws Exception{
        for(String path:List.of("/api/app/v1/me/password","/api/app/v1/data-export-requests",DELETION+"/confirm")){
            var request=write(path.endsWith("password")?"PATCH":"POST",path);request.removeHeader("Origin");request.addHeader("Sec-Fetch-Site","same-origin");
            rejected(request,403,"CSRF_INVALID");
        }
        verifyNoInteractions(csrf);
    }
    @Test void mutationsStillRequireJsonAndMatchingSessionCsrf()throws Exception{
        var wrongMedia=write("PATCH","/api/app/v1/me/password");wrongMedia.setContentType("text/plain");rejected(wrongMedia,415,"JSON_REQUIRED");
        var missingToken=write("PATCH","/api/app/v1/me/password");missingToken.removeHeader("X-CSRF-Token");rejected(missingToken,403,"CSRF_INVALID");
        run(write("PATCH","/api/app/v1/me/password"),true);
    }
    @Test void downloadDoesNotAllowReceiptCookieOrOperatorBearerToReplaceStudentSession()throws Exception{
        when(sessions.authenticate(null)).thenThrow(new ApiException(401,"AUTH_REQUIRED"));
        var request=request("GET",EXPORT+"/download");request.setCookies(new Cookie("MP_DELETION","synthetic-receipt"));request.addHeader("Authorization","Bearer synthetic-operator");request.addHeader("Sec-Fetch-Site","same-origin");
        rejected(request,401,"AUTH_REQUIRED");verify(sessions).authenticate(null);verifyNoInteractions(csrf);
    }
}
