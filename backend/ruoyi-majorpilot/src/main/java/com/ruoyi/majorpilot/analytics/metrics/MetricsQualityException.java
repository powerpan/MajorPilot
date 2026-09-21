package com.ruoyi.majorpilot.analytics.metrics;

/** Safe data-quality boundary. No row IDs, contact details, or source values in the message. */
public final class MetricsQualityException extends RuntimeException {
    private final String code;
    public MetricsQualityException(String code) { super(code); this.code = code; }
    public String code() { return code; }
}
