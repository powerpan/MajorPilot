package com.ruoyi.majorpilot.p0;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class P0Crypto {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final byte[] signingKey;
    private final Clock clock;
    public P0Crypto(String key) { this(key, Clock.systemUTC()); }
    P0Crypto(String key, Clock clock) {
        if (key == null || key.length() < 32) throw new IllegalArgumentException("MP_CSRF_SECRET must contain at least 32 characters");
        signingKey = key.getBytes(StandardCharsets.UTF_8); this.clock = clock;
    }
    public static String secret() { byte[] b = new byte[32]; RANDOM.nextBytes(b); return Base64.getUrlEncoder().withoutPadding().encodeToString(b); }
    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException("Hash unavailable"); }
    }
    public static boolean equal(String a, String b) { return a != null && b != null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8)); }
    public String csrf(String domain, String binding) {
        String body = domain + "." + Instant.now(clock).plusSeconds(3600).getEpochSecond() + "." + secret();
        return body + "." + sign(body + ":" + binding);
    }
    public boolean validCsrf(String token, String domain, String binding) {
        if (token == null || token.length() > 256) return false;
        String[] parts = token.split("\\.");
        if (parts.length != 4 || !parts[0].equals(domain)) return false;
        try {
            long expiry = Long.parseLong(parts[1]);
            if (expiry <= Instant.now(clock).getEpochSecond() || expiry > Instant.now(clock).plusSeconds(3600).getEpochSecond()) return false;
            return equal(parts[3], sign(parts[0] + "." + parts[1] + "." + parts[2] + ":" + binding));
        } catch (RuntimeException invalid) { return false; }
    }
    private String sign(String value) {
        try { Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(signingKey, "HmacSHA256")); return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException("CSRF signing unavailable"); }
    }
}
