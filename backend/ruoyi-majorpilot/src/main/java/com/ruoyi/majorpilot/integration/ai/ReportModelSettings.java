package com.ruoyi.majorpilot.integration.ai;

import java.util.Locale;
import org.springframework.core.env.Environment;

/** Report-only quality and resource limits; never inherit the much smaller hint/P0 budgets. */
public record ReportModelSettings(long requestTimeoutMs, int maxOutputTokens, int thinkingBudgetTokens,
                                  int maxResponseBytes, OutputFormat outputFormat) {
    public enum OutputFormat { JSON_SCHEMA, JSON_OBJECT, TEXT_JSON }
    public static final long MAX_TOTAL_BUDGET_MS = 2_700_000;
    public static final int MAX_INPUT_BYTES = 1_048_576;
    public static final int MAX_REVIEW_INPUT_BYTES = 2_097_152;

    public ReportModelSettings {
        if (requestTimeoutMs < 1_000 || requestTimeoutMs > 900_000 || maxOutputTokens < 8_192
                || maxOutputTokens > 131_072 || thinkingBudgetTokens < 4_096 || thinkingBudgetTokens > 32_768
                || maxResponseBytes < 262_144 || maxResponseBytes > 4_194_304 || outputFormat == null)
            throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
    }

    public static ReportModelSettings defaults(String provider) {
        // DeepSeek max_tokens includes reasoning as well as the final answer.
        return new ReportModelSettings(900_000, "DEEPSEEK".equals(provider) ? 65_536 : 32_768,
                32_768, 1_048_576, "BAILIAN".equals(provider) ? OutputFormat.JSON_SCHEMA : OutputFormat.JSON_OBJECT);
    }

    ReportModelSettings forProvider(String provider) {
        // Bailian thinking-mode max_tokens is answer-only and capped at 32768.
        // Do not silently clip an invalid override or disable the whole application.
        if ("BAILIAN".equals(provider) && maxOutputTokens > 32_768)
            throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
        // Strict schemas are capability-verified only on the selected Bailian report baseline.
        if (outputFormat == OutputFormat.JSON_SCHEMA && !"BAILIAN".equals(provider))
            throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
        return this;
    }

    static ReportModelSettings from(Environment env, String provider) {
        var defaults = defaults(provider);
        try {
            return new ReportModelSettings(
                    number(env, "MP_REPORT_AI_TIMEOUT_MS", defaults.requestTimeoutMs()),
                    Math.toIntExact(number(env, "MP_REPORT_AI_MAX_OUTPUT_TOKENS", defaults.maxOutputTokens())),
                    Math.toIntExact(number(env, "MP_REPORT_AI_THINKING_BUDGET_TOKENS", defaults.thinkingBudgetTokens())),
                    Math.toIntExact(number(env, "MP_REPORT_AI_MAX_RESPONSE_BYTES", defaults.maxResponseBytes())),
                    OutputFormat.valueOf(env.getProperty("MP_REPORT_AI_OUTPUT_FORMAT", defaults.outputFormat().name()).toUpperCase(Locale.ROOT))).forProvider(provider);
        } catch (RuntimeException ignored) {
            throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
        }
    }

    private static long number(Environment env, String key, long fallback) {
        String value = env.getProperty(key);
        return value == null || value.isBlank() ? fallback : Long.parseLong(value);
    }
}
