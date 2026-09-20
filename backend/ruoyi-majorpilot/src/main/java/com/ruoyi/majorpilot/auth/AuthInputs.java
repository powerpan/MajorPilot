package com.ruoyi.majorpilot.auth;
import com.ruoyi.majorpilot.shared.ApiException;
import jakarta.mail.internet.InternetAddress;
import java.net.IDN;
import java.util.Locale;
public final class AuthInputs {
    private AuthInputs() {}
    public static String email(String raw) {
        if(raw==null||raw.length()>254||raw.codePoints().anyMatch(Character::isISOControl))throw new ApiException(422,"VALIDATION_ERROR");
        String value=raw.trim();int at=value.lastIndexOf('@');if(at<1||at!=value.indexOf('@'))throw new ApiException(422,"VALIDATION_ERROR");
        try {
            String local=value.substring(0,at),domain=IDN.toASCII(value.substring(at+1),IDN.USE_STD3_ASCII_RULES);
            if(local.length()>64||local.codePoints().anyMatch(cp->cp>127)||!domain.contains("."))throw new IllegalArgumentException();
            String normalized=(local+"@"+domain).toLowerCase(Locale.ROOT);
            InternetAddress address=new InternetAddress(normalized,true);address.validate();
            if(address.getPersonal()!=null||!normalized.equals(address.getAddress())||normalized.length()>254)throw new IllegalArgumentException();
            return normalized;
        } catch(Exception invalid) { throw new ApiException(422,"VALIDATION_ERROR"); }
    }
    public static void newPassword(String password) {
        if(password==null||password.codePointCount(0,password.length())<15||password.codePointCount(0,password.length())>128||password.codePoints().anyMatch(Character::isISOControl))throw new ApiException(422,"PASSWORD_POLICY_INVALID");
    }
}
