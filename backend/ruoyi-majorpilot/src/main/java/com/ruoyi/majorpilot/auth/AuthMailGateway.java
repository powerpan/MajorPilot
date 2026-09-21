package com.ruoyi.majorpilot.auth;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import com.ruoyi.majorpilot.shared.Secrets;
import jakarta.annotation.PreDestroy;
import java.util.Set;
import java.util.concurrent.*;
@Service @Profile("local")
public class AuthMailGateway {
    private final JavaMailSender sender;private final JdbcTemplate jdbc;private final TransactionTemplate tx;
    private final ThreadPoolExecutor executor=new ThreadPoolExecutor(1,2,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(32),r->{Thread thread=new Thread(r,"local-auth-mail");thread.setDaemon(true);return thread;},new ThreadPoolExecutor.AbortPolicy());
    public AuthMailGateway(JavaMailSender sender,JdbcTemplate jdbc,TransactionTemplate tx) { this.sender=sender;this.jdbc=jdbc;this.tx=tx; }
    public void sendAsync(long studentId,String purpose,String token) { try{executor.execute(()->send(studentId,purpose,token));}catch(RejectedExecutionException busy){/* Safe recovery is a later resend; never persist the token in a queue. */} }
    @PreDestroy public void shutdown() { executor.shutdownNow(); }
    /** Local profile always uses the loopback catcher; no external SMTP configuration. */
    public boolean send(long studentId,String purpose,String token) {
        if(studentId<=0||purpose==null||!Set.of("VERIFY_EMAIL","RESET_PASSWORD","CHANGE_EMAIL").contains(purpose)||token==null||!token.matches("[A-Za-z0-9_-]{43}"))return false;
        try { return Boolean.TRUE.equals(tx.execute(status->{
            // All account mutation/deletion uses this same lock. A queued message cannot
            // start sending after deletion confirmation has committed. Already-sent SMTP
            // copies cannot be recalled, and are outside the database deletion guarantee.
            var accounts=jdbc.queryForList("SELECT status,locked_until,email_normalized FROM mp_student_account WHERE id=? FOR UPDATE",studentId);
            if(accounts.isEmpty())return false;var account=accounts.getFirst();
            String state=(String)account.get("status");
            if(!Set.of("ACTIVE","PENDING_VERIFICATION","LOCKED").contains(state)||("LOCKED".equals(state)&&(account.get("locked_until")==null||purpose.equals("CHANGE_EMAIL"))))return false;
            var tokens=jdbc.queryForList("SELECT target_email_normalized FROM mp_email_token WHERE student_id=? AND token_hash=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",studentId,Secrets.hash(token),purpose);
            if(tokens.isEmpty())return false;
            String email=(String)(purpose.equals("CHANGE_EMAIL")?tokens.getFirst().get("target_email_normalized"):account.get("email_normalized"));
            if(email==null||!AuthInputs.email(email).equals(email))return false;
            String route=switch(purpose){case "VERIFY_EMAIL"->"verify-email";case "CHANGE_EMAIL"->"change-email";default->"reset-password";};
            String subject=switch(purpose){case "VERIFY_EMAIL"->"MajorPilot 邮箱验证";case "CHANGE_EMAIL"->"MajorPilot 邮箱变更确认";default->"MajorPilot 密码重置";};
            SimpleMailMessage message=new SimpleMailMessage();message.setFrom("majorpilot@localhost.invalid");message.setTo(email);message.setSubject(subject);
            message.setText("请在本机浏览器打开以下链接。若非本人操作，请忽略此邮件。\nhttp://localhost:15173/"+route+"#token="+token);
            sender.send(message);return true;
        })); }catch(RuntimeException unavailable) { return false; }
    }
}
