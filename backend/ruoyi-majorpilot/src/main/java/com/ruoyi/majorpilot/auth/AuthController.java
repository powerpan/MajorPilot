package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.security.CsrfService;
import jakarta.servlet.http.*;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @Profile("local")
public class AuthController {
    private final AuthService auth;private final StudentSessions sessions;private final CsrfService csrf;
    public AuthController(AuthService auth,StudentSessions sessions,CsrfService csrf) { this.auth=auth;this.sessions=sessions;this.csrf=csrf; }
    @GetMapping("/api/public/v1/auth/csrf") public Object publicCsrf(HttpServletRequest req,HttpServletResponse res) { String secret=ApiResponses.cookie(req,"MP_INTAKE");return ApiResponses.success(req,Map.of("csrfToken",csrf.publicToken(req,res,secret==null?null:Secrets.hash(secret)))); }
    @PostMapping("/api/public/v1/auth/register") public Object register(@RequestBody AuthDtos.Register body,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req,HttpServletResponse res) {
        var account=auth.register(body,ApiResponses.intakeSecretHash(req),key,req.getRemoteAddr(),ApiResponses.requestId(req));
        ApiResponses.clearIntake(res);
        return ResponseEntity.status(201).body(ApiResponses.success(req,account));
    }
    @PostMapping("/api/public/v1/auth/login") public Object login(@RequestBody AuthDtos.Login body,HttpServletRequest req,HttpServletResponse res) {
        var result=auth.login(body,req.getRemoteAddr(),ApiResponses.requestId(req));
        // Login ends anonymous recovery on this browser, without claiming or deleting its database row.
        ApiResponses.clearIntake(res);
        ApiResponses.setCookie(res,"MP_SESSION",result.sessionSecret(),"/api/app/v1",true,604800);csrf.studentToken(req,res,Secrets.hash(result.sessionSecret()));
        return ApiResponses.success(req,result.me());
    }
    @PostMapping("/api/public/v1/auth/verify-email") @ResponseStatus(HttpStatus.NO_CONTENT) public void verify(@RequestBody AuthDtos.Token body,HttpServletRequest req) { auth.verify(body.token(),req.getRemoteAddr(),ApiResponses.requestId(req)); }
    @PostMapping("/api/public/v1/auth/verify-email/resend") public Object resend(@RequestBody AuthDtos.Email body,HttpServletRequest req) { auth.requestMail(body,"VERIFY_EMAIL",req.getRemoteAddr(),ApiResponses.requestId(req));return ResponseEntity.accepted().body(ApiResponses.success(req,Map.of("accepted",true))); }
    @PostMapping("/api/public/v1/auth/password/forgot") public Object forgot(@RequestBody AuthDtos.Email body,HttpServletRequest req) { auth.requestMail(body,"RESET_PASSWORD",req.getRemoteAddr(),ApiResponses.requestId(req));return ResponseEntity.accepted().body(ApiResponses.success(req,Map.of("accepted",true))); }
    @PostMapping("/api/public/v1/auth/password/reset") @ResponseStatus(HttpStatus.NO_CONTENT) public void reset(@RequestBody AuthDtos.Reset body,HttpServletRequest req,HttpServletResponse res) { auth.reset(body,req.getRemoteAddr(),ApiResponses.requestId(req));ApiResponses.clearStudent(res); }
    @GetMapping("/api/app/v1/me") public Object me(HttpServletRequest req) { return ApiResponses.success(req,auth.me(ApiResponses.student(req))); }
    @GetMapping("/api/app/v1/auth/csrf") public Object studentCsrf(HttpServletRequest req,HttpServletResponse res) { return ApiResponses.success(req,Map.of("csrfToken",csrf.studentToken(req,res,Secrets.hash(ApiResponses.cookie(req,"MP_SESSION"))))); }
    @PostMapping("/api/app/v1/auth/logout") @ResponseStatus(HttpStatus.NO_CONTENT) public void logout(HttpServletRequest req,HttpServletResponse res) { sessions.revokeCurrent(ApiResponses.cookie(req,"MP_SESSION"));ApiResponses.clearStudent(res); }
    @GetMapping("/api/app/v1/consents") public Object consents(HttpServletRequest req) { return ApiResponses.success(req,auth.consents(ApiResponses.student(req))); }
    @PostMapping("/api/app/v1/consents/research/withdraw") @ResponseStatus(HttpStatus.NO_CONTENT) public void withdraw(HttpServletRequest req) { auth.withdrawResearch(ApiResponses.student(req),req.getRemoteAddr(),ApiResponses.requestId(req)); }
}
