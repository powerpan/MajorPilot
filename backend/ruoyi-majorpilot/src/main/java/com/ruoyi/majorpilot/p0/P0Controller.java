package com.ruoyi.majorpilot.p0;

import java.util.Map;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.flywaydb.core.Flyway;
import org.springframework.web.bind.annotation.*;

@RestController @Profile("p0")
public class P0Controller {
    private final P0Crypto crypto; private final P0IdentityStore identities; private final JdbcTemplate jdbc; private final String password;private final RedisConnectionFactory redis;private final Flyway flyway;
    public P0Controller(P0Crypto crypto,P0IdentityStore identities,JdbcTemplate jdbc,RedisConnectionFactory redis,Flyway flyway,@Value("${MP_P0_STUDENT_PASSWORD}") String password) { this.crypto=crypto;this.identities=identities;this.jdbc=jdbc;this.redis=redis;this.flyway=flyway;this.password=password; if(password.length()<16) throw new IllegalArgumentException("P0 password must contain at least 16 characters"); }
    @GetMapping("/api/public/v1/p0/health") Object health(HttpServletRequest req) {
        String database="DOWN",cache="DOWN",migration="DOWN";
        try { if(jdbc.queryForObject("SELECT 1",Integer.class)==1) database="UP"; } catch(RuntimeException unavailable) {}
        try(var connection=redis.getConnection()) { if("PONG".equals(connection.ping())) cache="UP"; } catch(RuntimeException unavailable) {}
        if("UP".equals(database)) try { if(flyway.validateWithResult().validationSuccessful && flyway.info().pending().length==0) migration="UP"; } catch(RuntimeException unavailable) {}
        boolean ready="UP".equals(database)&&"UP".equals(cache)&&"UP".equals(migration);
        return ResponseEntity.status(ready?200:503).body(P0Http.success(req,Map.of("scope","p0-local-only","database",database,"redis",cache,"migration",migration,"model","NOT_CHECKED","mail","NOT_CHECKED")));
    }
    @GetMapping("/api/public/v1/auth/csrf") Object publicCsrf(HttpServletRequest req,HttpServletResponse res) {
        String intake=P0Http.cookie(req,"MP_INTAKE"); return P0Http.success(req,Map.of("csrfToken",setCsrf(res,false,intake)));
    }
    @PostMapping("/api/public/v1/p0/intake") Object intake(HttpServletRequest req,HttpServletResponse res) {
        String secret=P0Crypto.secret();String id=identities.intake(secret);
        P0Http.setCookie(res,"MP_INTAKE",secret,P0Http.PUBLIC,true,604800);setCsrf(res,false,secret);
        return P0Http.success(req,Map.of("intakeId",id));
    }
    @PostMapping("/api/public/v1/p0/claim") Object claim(HttpServletRequest req,HttpServletResponse res) {
        String actor=identities.claim(P0Http.cookie(req,"MP_INTAKE"));
        P0Http.setCookie(res,"MP_INTAKE","",P0Http.PUBLIC,true,0);P0Http.setCookie(res,"MP_PUBLIC_CSRF","","/",false,0);
        return P0Http.success(req,Map.of("studentId",actor,"scope","synthetic-p0-actor"));
    }
    public record Login(String studentId,String password) {}
    public record Password(String password) {}
    public record Example(String label) {}
    @PostMapping("/api/public/v1/p0/login") Object login(@RequestBody Login body,HttpServletRequest req,HttpServletResponse res) {
        checkPassword(body.password()); if(body.studentId()==null) throw new P0Http.Rejected(401,"AUTH_REQUIRED");
        String session=identities.login(body.studentId());
        P0Http.setCookie(res,"MP_SESSION",session,P0Http.APP,true,604800);setCsrf(res,true,session);
        return P0Http.success(req,Map.of("studentId",body.studentId()));
    }
    @GetMapping("/api/app/v1/auth/csrf") Object studentCsrf(HttpServletRequest req,HttpServletResponse res) { return P0Http.success(req,Map.of("csrfToken",setCsrf(res,true,P0Http.cookie(req,"MP_SESSION")))); }
    @GetMapping("/api/app/v1/p0/whoami") Object whoami(HttpServletRequest req) { return P0Http.success(req,Map.of("studentId",actor(req),"subjectType","P0_STUDENT")); }
    @PostMapping("/api/app/v1/auth/logout") Object logout(HttpServletRequest req,HttpServletResponse res) {
        identities.logout(P0Http.cookie(req,"MP_SESSION"));P0Http.clearSession(res);return P0Http.success(req,Map.of("loggedOut",true));
    }
    @PostMapping("/api/app/v1/p0/deletion") Object deletion(HttpServletRequest req,HttpServletResponse res) {
        String secret=P0Crypto.secret();String id=identities.receipt(actor(req),secret);
        P0Http.setCookie(res,"MP_DELETION",secret,P0Http.PUBLIC+"/deletion-receipts",true,127L*86400);
        return P0Http.success(req,Map.of("receiptId",id));
    }
    @PostMapping("/api/app/v1/p0/delete-confirm") Object confirm(@RequestBody Password body,HttpServletRequest req,HttpServletResponse res) {
        checkPassword(body.password());identities.delete(actor(req));P0Http.clearSession(res);return P0Http.success(req,Map.of("status","COMPLETED","scope","synthetic-p0-only"));
    }
    @GetMapping("/api/public/v1/deletion-receipts/{id}") Object receipt(@PathVariable String id,HttpServletRequest req) { return P0Http.success(req,identities.receiptStatus(id,P0Http.cookie(req,"MP_DELETION"))); }
    @PostMapping("/api/app/v1/p0/examples") Object create(@RequestBody Example body,HttpServletRequest req) {
        if(body.label()==null || body.label().isBlank() || body.label().length()>80) throw new P0Http.Rejected(422,"VALIDATION_ERROR");
        String id=UUID.randomUUID().toString();jdbc.update("INSERT INTO mp_p0_example(id,actor_id,label) VALUES(?,?,?)",id,actor(req),body.label());return P0Http.success(req,Map.of("id",id,"label",body.label()));
    }
    @GetMapping("/api/app/v1/p0/examples") Object list(HttpServletRequest req) { return P0Http.success(req,jdbc.queryForList("SELECT id,label FROM mp_p0_example WHERE actor_id=? ORDER BY created_at",actor(req))); }
    @DeleteMapping("/api/app/v1/p0/examples/{id}") Object remove(@PathVariable String id,HttpServletRequest req) { if(jdbc.update("DELETE FROM mp_p0_example WHERE id=? AND actor_id=?",id,actor(req))==0) throw new P0Http.Rejected(404,"NOT_FOUND");return P0Http.success(req,Map.of("deleted",true)); }
    @ExceptionHandler(P0Http.Rejected.class) ResponseEntity<?> rejected(P0Http.Rejected error,HttpServletRequest req) { return ResponseEntity.status(error.status).body(P0Http.error(req,error.code,"P0 request rejected")); }
    private String setCsrf(HttpServletResponse res,boolean student,String secret) {
        String token=crypto.csrf(student?"student":"public",secret==null?"anonymous":P0Crypto.hash(secret));
        P0Http.setCookie(res,student?"MP_CSRF":"MP_PUBLIC_CSRF",token,"/",false,3600);return token;
    }
    private String actor(HttpServletRequest req) { return (String)req.getAttribute("mp.actor"); }
    private void checkPassword(String candidate) { if(!P0Crypto.equal(password,candidate)) throw new P0Http.Rejected(401,"AUTH_REQUIRED"); }
}
