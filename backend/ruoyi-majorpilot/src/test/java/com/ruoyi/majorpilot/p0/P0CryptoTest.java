package com.ruoyi.majorpilot.p0;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class P0CryptoTest {
    private final String key="synthetic-test-csrf-signing-key-never-a-real-secret";
    @Test void tokensRequireSignatureDomainBindingAndExpiry() {
        Clock now=Clock.fixed(Instant.parse("2026-09-20T00:00:00Z"),ZoneOffset.UTC);
        P0Crypto crypto=new P0Crypto(key,now);String token=crypto.csrf("public","intake-a");
        assertTrue(crypto.validCsrf(token,"public","intake-a"));
        assertFalse(crypto.validCsrf(token,"student","intake-a"));
        assertFalse(crypto.validCsrf(token,"public","intake-b"));
        assertFalse(crypto.validCsrf(token+"a","public","intake-a"));
        assertFalse(new P0Crypto(key,Clock.offset(now,java.time.Duration.ofHours(2))).validCsrf(token,"public","intake-a"));
    }
    @Test void opaqueSecretsAreHighEntropyAndHashesStable() {
        String a=P0Crypto.secret(),b=P0Crypto.secret();assertNotEquals(a,b);assertEquals(43,a.length());assertEquals(64,P0Crypto.hash(a).length());assertTrue(P0Crypto.equal(a,a));assertFalse(P0Crypto.equal(a,b));assertFalse(P0Crypto.equal(null,null));
    }
}
