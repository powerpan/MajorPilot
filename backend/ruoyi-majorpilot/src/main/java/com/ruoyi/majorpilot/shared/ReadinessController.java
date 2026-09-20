package com.ruoyi.majorpilot.shared;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
@RestController @Profile({"p0","local"})
public class ReadinessController {
    private final JdbcTemplate jdbc;private final RedisConnectionFactory redis;private final Flyway flyway;
    public ReadinessController(JdbcTemplate jdbc,RedisConnectionFactory redis,Flyway flyway) { this.jdbc=jdbc;this.redis=redis;this.flyway=flyway; }
    @GetMapping("/api/public/v1/health") public Object readiness(HttpServletRequest req) {
        String database="DOWN",cache="DOWN",migration="DOWN";
        try{if(jdbc.queryForObject("SELECT 1",Integer.class)==1)database="UP";}catch(RuntimeException unavailable){}
        try(var connection=redis.getConnection()){if("PONG".equals(connection.ping()))cache="UP";}catch(RuntimeException unavailable){}
        if(database.equals("UP"))try{if(flyway.validateWithResult().validationSuccessful&&flyway.info().pending().length==0)migration="UP";}catch(RuntimeException unavailable){}
        boolean ready=database.equals("UP")&&cache.equals("UP")&&migration.equals("UP");
        return ResponseEntity.status(ready?200:503).body(ApiResponses.success(req,Map.of("scope","local-only","database",database,"redis",cache,"migration",migration,"model","NOT_CHECKED","mail","NOT_CHECKED")));
    }
}
