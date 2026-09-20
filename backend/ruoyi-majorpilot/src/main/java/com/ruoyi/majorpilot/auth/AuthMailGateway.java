package com.ruoyi.majorpilot.auth;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.*;
@Service @Profile("local")
public class AuthMailGateway {
    private final JavaMailSender sender;
    private final ThreadPoolExecutor executor=new ThreadPoolExecutor(1,2,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(32),r->{Thread thread=new Thread(r,"local-auth-mail");thread.setDaemon(true);return thread;},new ThreadPoolExecutor.AbortPolicy());
    public AuthMailGateway(JavaMailSender sender) { this.sender=sender; }
    public void sendAsync(String email,String purpose,String token) { try{executor.execute(()->send(email,purpose,token));}catch(RejectedExecutionException busy){/* Safe recovery is a later resend; never persist the token in a queue. */} }
    @PreDestroy public void shutdown() { executor.shutdownNow(); }
    /** Local profile always uses the loopback catcher; no external SMTP configuration. */
    public boolean send(String email,String purpose,String token) {
        SimpleMailMessage message=new SimpleMailMessage();message.setFrom("majorpilot@localhost.invalid");message.setTo(email);
        boolean verify=purpose.equals("VERIFY_EMAIL");
        message.setSubject(verify?"MajorPilot 邮箱验证":"MajorPilot 密码重置");
        message.setText("请在本机浏览器打开以下链接。若非本人操作，请忽略此邮件。\nhttp://localhost:15173/"+(verify?"verify-email":"reset-password")+"#token="+token);
        try { sender.send(message);return true; }catch(RuntimeException unavailable) { return false; }
    }
}
