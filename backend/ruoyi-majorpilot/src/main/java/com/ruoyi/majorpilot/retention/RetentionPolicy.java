package com.ruoyi.majorpilot.retention;

import java.time.Duration;
import java.time.Instant;

/** Existing IntakeRetention/AuthRetention policies intentionally are not scheduled here. */
public enum RetentionPolicy {
    AI_METADATA(90), PRODUCT_EVENTS(180), SENSITIVE_AUDITS(180), TERMINAL_JOBS(30),
    EXPORT_FILES(1), EXPORT_METADATA(30), UNCONFIRMED_DELETIONS(7), EXPIRED_RECEIPTS(0), STALE_PARTIALS(1);
    private final int days;
    RetentionPolicy(int days){this.days=days;}
    public Instant cutoff(Instant asOf){return asOf.minus(Duration.ofDays(days));}
    public static final int MAX_BATCH=100;
    public static int checkedBatch(int batch){if(batch<1||batch>MAX_BATCH)throw new IllegalArgumentException("Invalid retention batch");return batch;}
    public static RetentionPolicy parse(String key){try{return valueOf(key);}catch(RuntimeException invalid){throw new IllegalArgumentException("RETENTION_POLICY_INVALID");}}
}
