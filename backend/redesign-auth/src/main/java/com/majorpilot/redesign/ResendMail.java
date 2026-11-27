package com.majorpilot.redesign;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

@Component
final class ResendMail {
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
    private final ObjectMapper json;
    private final URI endpoint;
    private final String origin;
    private final String key;
    private final String sender;
    private final String recipient;

    ResendMail(ObjectMapper json, @Value("${demo.mail-endpoint}") URI endpoint,
            @Value("${demo.origin}") String origin, @Value("${demo.resend-key}") String key,
            @Value("${demo.sender}") String sender, @Value("${demo.recipient}") String recipient) {
        boolean local = origin.matches("http://(?:localhost|127\\.0\\.0\\.1):[0-9]+");
        if ((!local && !"https://major.erichz.tech".equals(origin))
                || (!endpoint.toString().equals("https://api.resend.com/emails")
                    && (!local || !endpoint.toString().matches("http://127\\.0\\.0\\.1:[0-9]+/emails")))
                || !key.matches("re_[A-Za-z0-9_-]{20,}")) {
            throw new IllegalArgumentException("Invalid redesign email configuration.");
        }
        this.json = json;
        this.endpoint = endpoint;
        this.origin = origin;
        this.key = key;
        this.sender = sender;
        this.recipient = recipient;
    }

    boolean recipientAllowed(String email) {
        return recipient.isEmpty() || recipient.equals(email);
    }

    boolean send(String email, String token, boolean chinese) {
        String url = origin + "/#sign-in=" + token;
        String subject = chinese ? "登录 MajorPilot Demo" : "Sign in to the MajorPilot Demo";
        String text = chinese
                ? "打开链接，在页面上确认登录。链接 15 分钟内有效，只能使用一次。\n\n" + url
                    + "\n\n如果你没有申请登录，请忽略这封邮件。"
                : "Open the link and confirm sign-in in your browser. This link expires in 15 minutes and works once.\n\n"
                    + url + "\n\nIf you didn't request this email, you can ignore it.";
        try {
            var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(8))
                    .header("Authorization", "Bearer " + key)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(
                            Map.of("from", sender, "to", email, "subject", subject, "text", text))))
                    .build();
            int status = client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status >= 200 && status < 300) return true;
            LoggerFactory.getLogger(ResendMail.class).warn("Resend declined a demo login email: HTTP {}", status);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (IOException e) {
            LoggerFactory.getLogger(ResendMail.class).warn("Resend request was unavailable: {}", e.getClass().getSimpleName());
        }
        return false;
    }
}
