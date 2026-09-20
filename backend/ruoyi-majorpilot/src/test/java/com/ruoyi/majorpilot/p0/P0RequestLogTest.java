package com.ruoyi.majorpilot.p0;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.ruoyi.majorpilot.shared.StudentPrincipal;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.*;
import org.springframework.web.servlet.HandlerMapping;
import static org.junit.jupiter.api.Assertions.*;

class P0RequestLogTest {
    @Test void onlyTemplateAndPrincipalTypeReachRequestLog()throws Exception {
        var request=new MockHttpServletRequest("POST","/api/app/v1/recommendations/private-resource-id/decision");
        request.setQueryString("token=private-query-token");request.addHeader("Authorization","Bearer private-header-token");request.setCookies(new Cookie("MP_SESSION","private-cookie-token"));request.setContent("{\"email\":\"private-user@example.invalid\"}".getBytes());
        Logger logger=(Logger)LoggerFactory.getLogger(P0RequestLog.class);var events=new ListAppender<ILoggingEvent>();events.start();logger.addAppender(events);
        try {
            var response=new MockHttpServletResponse();
            new P0RequestLog().doFilter(request,response,(req,res)->{req.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE,"/api/app/v1/recommendations/{id}/decision");req.setAttribute("mp.student",new StudentPrincipal(901,"private-student-id","ACTIVE"));});
            String logged=events.list.getLast().getFormattedMessage();
            assertTrue(logged.contains("route=/api/app/v1/recommendations/{id}/decision"));assertTrue(logged.contains("subject_type=STUDENT"));assertTrue(logged.contains("request_id="+response.getHeader("X-Request-Id")));
            for(String forbidden:new String[]{"private-","example.invalid","Authorization","MP_SESSION"})assertFalse(logged.contains(forbidden));
        } finally {logger.detachAppender(events);events.stop();}
    }
    @Test void rejectionWithoutControllerNeverFallsBackToRawPath()throws Exception {
        var request=new MockHttpServletRequest("CUSTOMPRIVATEVERB","/private-secret-in-unknown-path");
        Logger logger=(Logger)LoggerFactory.getLogger(P0RequestLog.class);var events=new ListAppender<ILoggingEvent>();events.start();logger.addAppender(events);
        try {new P0RequestLog().doFilter(request,new MockHttpServletResponse(),(req,res)->{});String logged=events.list.getLast().getFormattedMessage();assertTrue(logged.contains("method=OTHER route=UNMATCHED"));assertFalse(logged.contains("private-secret"));assertFalse(logged.contains("CUSTOMPRIVATEVERB"));}
        finally{logger.detachAppender(events);events.stop();}
    }
}
