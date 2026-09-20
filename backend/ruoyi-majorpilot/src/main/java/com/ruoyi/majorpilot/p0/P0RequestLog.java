package com.ruoyi.majorpilot.p0;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

/** Logs generated correlation IDs and route templates only: never URL IDs, headers, body or exception text. */
@Component @Profile("p0") @Order(Ordered.HIGHEST_PRECEDENCE+20)
public class P0RequestLog extends OncePerRequestFilter {
    private static final Logger LOG=LoggerFactory.getLogger(P0RequestLog.class);
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
        long start=System.nanoTime();String id=P0Http.requestId(req);res.setHeader("X-Request-Id",id);
        try { chain.doFilter(req,res); }
        finally {
            Object matched=req.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
            String route=matched==null?"UNMATCHED":matched.toString();
            String actor=req.getAttribute("mp.actor")==null?"ANONYMOUS_OR_OPERATOR":"P0_STUDENT";
            LOG.info("request_id={} method={} route={} status={} elapsed_ms={} subject_type={}",id,req.getMethod(),route,res.getStatus(),(System.nanoTime()-start)/1_000_000,actor);
        }
    }
}
