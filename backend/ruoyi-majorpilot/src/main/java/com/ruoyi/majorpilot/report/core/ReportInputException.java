package com.ruoyi.majorpilot.report.core;
/** Hard source/catalog failure. Never route through provider repair or fallback. */
public final class ReportInputException extends RuntimeException {
    public final String code;
    public ReportInputException(String code){super(code);if(!java.util.Set.of("REPORT_SOURCE_INVALID","REPORT_CATALOG_INVALID","EVIDENCE_RULE_UNSUPPORTED").contains(code))throw new IllegalArgumentException("Unknown report failure");this.code=code;}
}
