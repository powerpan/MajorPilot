package com.ruoyi.majorpilot.auth;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Component;
@Component @Profile({"local","pilot"})
public class StudentPasswords {
    // OWASP Argon2id minimum: 19 MiB memory, two iterations, one parallel lane.
    private final Argon2PasswordEncoder encoder=new Argon2PasswordEncoder(16,32,1,19456,2);
    private final String dummy=encoder.encode("synthetic timing equalization passphrase");
    public String hash(String password) { AuthInputs.newPassword(password);return encoder.encode(password); }
    public boolean matches(String password,String hash) { String candidate=password==null||password.length()>512?"invalid":password;return encoder.matches(candidate,hash==null?dummy:hash)&&hash!=null; }
}
