package com.majorpilot.redesign;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@Component
final class DemoAccounts {
    record Account(String id, String email, long revision, String progress) {}
    record Login(Account account, String session) {}
    record Save(Account account, boolean saved) {}

    static final long SESSION_SECONDS = 7 * 24 * 60 * 60;
    private static final Pattern EMAIL = Pattern.compile(
            "[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+");
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final Clock clock = Clock.systemUTC();

    DemoAccounts(JdbcTemplate db, TransactionTemplate tx) {
        this.db = db;
        this.tx = tx;
    }

    static String email(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return value.length() <= 254 && EMAIL.matcher(value).matches()
                && !value.startsWith(".") && !value.contains("..") && !value.contains(".@") ? value : null;
    }

    String issue(String email, String ip) {
        return tx.execute(status -> {
            if (!allow("day", 86400, 100) || !allow("ip:" + ip, 900, 8)
                    || !allow("email:" + email, 3600, 5) || !allow("resend:" + email, 60, 1)) {
                status.setRollbackOnly();
                return null;
            }
            String token = token();
            db.update("INSERT INTO demo_link(token_hash,email,expires_at) VALUES (?,?,UTC_TIMESTAMP(3)+INTERVAL 15 MINUTE)",
                    hash(token), email);
            return token;
        });
    }

    void discardLink(String token) {
        db.update("DELETE FROM demo_link WHERE token_hash=?", hash(token));
    }

    Login consume(String token, String previousSession) {
        if (!validToken(token)) return null;
        return tx.execute(status -> {
            var links = db.queryForList("SELECT email FROM demo_link WHERE token_hash=? AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",
                    String.class, hash(token));
            if (links.isEmpty()) return null;
            db.update("DELETE FROM demo_link WHERE token_hash=?", hash(token));
            db.update("INSERT INTO demo_account(id,email) VALUES (?,?) ON DUPLICATE KEY UPDATE email=email",
                    UUID.randomUUID().toString(), links.getFirst());
            Account account = db.query("SELECT id,email,revision,progress FROM demo_account WHERE email=?",
                    (r,n) -> new Account(r.getString(1), r.getString(2), r.getLong(3), r.getString(4)), links.getFirst()).getFirst();
            // A newly verified link rotates the credential for the current browser only.
            logout(previousSession);
            String session = token();
            db.update("INSERT INTO demo_session(token_hash,account_id,expires_at) VALUES (?,?,UTC_TIMESTAMP(3)+INTERVAL 7 DAY)",
                    hash(session), account.id());
            return new Login(account, session);
        });
    }

    Account account(String session) {
        if (!validToken(session)) return null;
        return db.query("""
                SELECT a.id,a.email,a.revision,a.progress FROM demo_session s
                JOIN demo_account a ON s.account_id=a.id
                WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)
                """, (r,n) -> new Account(r.getString(1), r.getString(2), r.getLong(3), r.getString(4)),
                hash(session)).stream().findFirst().orElse(null);
    }

    Save save(String session, String owner, long revision, String progress) {
        int changed = db.update("""
                UPDATE demo_account a JOIN demo_session s ON a.id=s.account_id
                SET a.progress=?,a.revision=a.revision+1
                WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND a.id=? AND a.revision=?
                """, progress, hash(session), owner, revision);
        return changed == 1 ? new Save(null, true) : new Save(account(session), false);
    }

    void logout(String session) {
        if (validToken(session)) db.update("DELETE FROM demo_session WHERE token_hash=?", hash(session));
    }

    private boolean allow(String key, int seconds, int limit) {
        long end = (clock.instant().getEpochSecond() / seconds + 1) * seconds;
        String hashed = hash(key);
        db.update("""
                INSERT INTO demo_mail_limit(bucket_key,bucket_end) VALUES (?,?)
                ON DUPLICATE KEY UPDATE hits=hits+1
                """, hashed, end);
        return db.queryForObject("SELECT hits FROM demo_mail_limit WHERE bucket_key=? AND bucket_end=?",
                Integer.class, hashed, end) <= limit;
    }

    @Scheduled(initialDelay = 60000, fixedDelay = 600000)
    void expire() {
        db.update("DELETE FROM demo_link WHERE expires_at<=UTC_TIMESTAMP(3)");
        db.update("DELETE FROM demo_session WHERE expires_at<=UTC_TIMESTAMP(3)");
        db.update("DELETE FROM demo_mail_limit WHERE bucket_end<=?", clock.instant().getEpochSecond());
    }

    private static String token() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static boolean validToken(String value) {
        return value != null && value.matches("[A-Za-z0-9_-]{43}");
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
