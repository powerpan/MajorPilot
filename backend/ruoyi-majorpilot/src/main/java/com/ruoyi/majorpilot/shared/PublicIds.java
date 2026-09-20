package com.ruoyi.majorpilot.shared;
import java.math.BigInteger;
import java.security.SecureRandom;
/** ULID-shaped 48-bit timestamp + 80 random bits, never an authorization credential. */
public final class PublicIds {
    private static final SecureRandom RANDOM=new SecureRandom();
    private static final String ALPHABET="0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private PublicIds() {}
    public static String next() {
        byte[] bytes=new byte[16];RANDOM.nextBytes(bytes);long now=System.currentTimeMillis();
        for(int i=5;i>=0;i--) { bytes[i]=(byte)now;now>>>=8; }
        BigInteger value=new BigInteger(1,bytes);char[] chars=new char[26];
        for(int i=25;i>=0;i--) { chars[i]=ALPHABET.charAt(value.and(BigInteger.valueOf(31)).intValue());value=value.shiftRight(5); }
        return new String(chars);
    }
}
