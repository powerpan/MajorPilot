package com.ruoyi.majorpilot.shared;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
@Component @Profile({"local","pilot"})
public final class Secrets {
    private static final SecureRandom RANDOM=new SecureRandom();private final byte[] key;
    public Secrets(@Value("${MP_CSRF_SECRET}") String key) { if(key.length()<32)throw new IllegalArgumentException("Strong local signing secret required");this.key=key.getBytes(StandardCharsets.UTF_8); }
    public static String random() { byte[] bytes=new byte[32];RANDOM.nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    public static String hash(String value) { try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException("Hash unavailable");} }
    public static boolean equal(String first,String second) { return first!=null&&second!=null&&MessageDigest.isEqual(first.getBytes(StandardCharsets.UTF_8),second.getBytes(StandardCharsets.UTF_8)); }
    public String hmac(String purpose,String input) { try { Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal((purpose+"\0"+input).getBytes(StandardCharsets.UTF_8))); }catch(Exception e){throw new IllegalStateException("Signing unavailable");} }
}
