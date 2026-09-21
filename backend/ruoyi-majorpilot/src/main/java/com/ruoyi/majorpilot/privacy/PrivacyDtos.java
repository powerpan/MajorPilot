package com.ruoyi.majorpilot.privacy;

import java.time.Instant;

public final class PrivacyDtos {
    private PrivacyDtos() {}
    public record ExportRequest(String scope) {}
    public record ExportStatus(String exportId,String scope,String status,String format,Instant requestedAt,
            Instant completedAt,Instant expiresAt,String failureCode,Long fileSizeBytes) {}
    public record EmailChange(String currentPassword,String newEmail) {}
    public record EmailConfirm(String token) {}
    public record PasswordChange(String currentPassword,String newPassword) {}
    public record DeletionConfirm(String currentPassword) {}
    public record DeletionStatus(String requestId,String receiptId,String status,Instant requestedAt,
            Instant confirmedAt,Instant scheduledFor,Instant completedAt,Instant receiptExpiresAt) {}
    public record Receipt(String status,Instant requestedAt,Instant confirmedAt,Instant scheduledFor,
            Instant completedAt,Instant expiresAt) {}
    /** Internal only. Never serialize the cookie secret into a response body or idempotency record. */
    record IssuedDeletion(DeletionStatus status,String secret) {}
}
