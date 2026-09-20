package com.ruoyi.majorpilot.p0;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.bind.annotation.*;

/** Sends synthetic links only to the local mail catcher. No user addresses or credentials accepted. */
@RestController @Profile("p0")
public class P0MailController {
    private final JavaMailSender mail;
    public P0MailController(JavaMailSender mail) { this.mail=mail; }
    public record Probe(String kind) {}
    @PostMapping("/api/app/v1/p0/mail") public Object send(@RequestBody Probe body,HttpServletRequest req) {
        if(body.kind()==null || !Set.of("verify","reset").contains(body.kind())) throw new P0Http.Rejected(422,"VALIDATION_ERROR");
        String id=UUID.randomUUID().toString();var message=new SimpleMailMessage();
        message.setFrom("majorpilot@localhost.invalid");message.setTo("p0-probe@localhost.invalid");
        message.setSubject("MajorPilot P0 " + body.kind() + " " + id);
        message.setText("Synthetic P0 mail only; this is not a real account token.\nhttp://localhost:15173/p0-mail/"+body.kind()+"#token=p0-synthetic-"+id);
        mail.send(message);return P0Http.success(req,Map.of("messageId",id,"kind",body.kind(),"scope","synthetic-local-mail"));
    }
}
