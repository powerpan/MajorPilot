package com.ruoyi.majorpilot.auth;

import com.ruoyi.majorpilot.privacy.PrivacyDtos;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @Profile({"local","pilot"}) @RequestMapping("/api/app/v1/me")
public class AccountSettingsController {
    private final AccountSettingsService service;
    public AccountSettingsController(AccountSettingsService service) { this.service=service; }
    @PatchMapping("/email") public Object email(@RequestBody PrivacyDtos.EmailChange input,HttpServletRequest req) {
        service.requestEmail(ApiResponses.student(req),input,req.getRemoteAddr(),ApiResponses.requestId(req));
        return ResponseEntity.accepted().body(ApiResponses.success(req,Map.of("accepted",true)));
    }
    @PostMapping("/email/confirm") @ResponseStatus(HttpStatus.NO_CONTENT) public void confirm(@RequestBody PrivacyDtos.EmailConfirm input,HttpServletRequest req,HttpServletResponse res) {
        service.confirmEmail(ApiResponses.student(req),input,req.getRemoteAddr(),ApiResponses.requestId(req));ApiResponses.clearStudent(res);
    }
    @PatchMapping("/password") @ResponseStatus(HttpStatus.NO_CONTENT) public void password(@RequestBody PrivacyDtos.PasswordChange input,HttpServletRequest req,HttpServletResponse res) {
        service.changePassword(ApiResponses.student(req),input,req.getRemoteAddr(),ApiResponses.requestId(req));ApiResponses.clearStudent(res);
    }
}
