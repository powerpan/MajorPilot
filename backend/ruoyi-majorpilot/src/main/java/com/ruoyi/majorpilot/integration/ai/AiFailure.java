package com.ruoyi.majorpilot.integration.ai;

/** Stable safe codes only: deliberately never retain supplier messages, headers or exception causes. */
public final class AiFailure extends RuntimeException {
    public enum Code { INVALID_INPUT, CONFIG_INVALID, AUTH_FAILED, RATE_LIMITED, UPSTREAM_UNAVAILABLE, UPSTREAM_REJECTED, TIMEOUT, TRANSPORT_FAILED, INVALID_OUTPUT, OUTPUT_LIMIT, REPLAY_MISSING }
    private final Code code;
    public AiFailure(Code code) { super(code.name()); this.code = code; }
    public Code code() { return code; }
}
