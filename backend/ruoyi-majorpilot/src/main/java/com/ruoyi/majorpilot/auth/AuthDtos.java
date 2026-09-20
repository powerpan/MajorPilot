package com.ruoyi.majorpilot.auth;
import java.util.List;
public final class AuthDtos {
    private AuthDtos() {}
    public record Consent(String documentType,String documentVersion,String decision) {}
    public record Register(String intakeSessionId,String email,String password,List<Consent> consents) { @Override public String toString(){return "Register[redacted]";} }
    public record Registered(String studentId,String status,String nextAction,String emailDeliveryStatus) {}
    public record RegistrationIdentity(String studentId,String status,String nextAction) {}
    public record Login(String email,String password) { @Override public String toString(){return "Login[redacted]";} }
    public record Email(String email) { @Override public String toString(){return "Email[redacted]";} }
    public record Token(String token) { @Override public String toString(){return "Token[redacted]";} }
    public record Reset(String token,String newPassword) { @Override public String toString(){return "Reset[redacted]";} }
    public record Me(String studentId,String email,String status,boolean emailVerified,boolean canStartExperience) {}
    public record LoginResult(Me me,String sessionSecret) { @Override public String toString(){return "LoginResult[redacted]";} }
}
