package com.ruoyi.majorpilot.security;
import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.*;
import java.time.Instant;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
@Service @Profile({"local","pilot"})
public class CsrfService {
    private final Secrets secrets;
    public CsrfService(Secrets secrets) { this.secrets=secrets; }
    public String publicToken(HttpServletRequest req,HttpServletResponse res,String intakeHash) { return issue(res,"public",intakeHash,"MP_PUBLIC_CSRF"); }
    public String studentToken(HttpServletRequest req,HttpServletResponse res,String sessionHash) { return issue(res,"student",sessionHash,"MP_CSRF"); }
    private String issue(HttpServletResponse res,String boundary,String binding,String cookie) {
        String body=boundary+"."+Instant.now().plusSeconds(3600).getEpochSecond()+"."+Secrets.random();
        String token=body+"."+secrets.hmac("csrf-"+boundary,body+":"+(binding==null?"anonymous":binding));
        ApiResponses.setCookie(res,cookie,token,"/",false,3600);return token;
    }
    public boolean valid(String token,String boundary,String binding) {
        if(token==null||token.length()>256)return false;String[] parts=token.split("\\.");
        if(parts.length!=4||!parts[0].equals(boundary))return false;
        try { long expiry=Long.parseLong(parts[1]),now=Instant.now().getEpochSecond();return expiry>now&&expiry<=now+3600&&Secrets.equal(parts[3],secrets.hmac("csrf-"+boundary,parts[0]+"."+parts[1]+"."+parts[2]+":"+(binding==null?"anonymous":binding))); }catch(RuntimeException invalid){return false;}
    }
}
