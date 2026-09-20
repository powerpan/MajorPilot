package com.ruoyi.majorpilot.integration.ai;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** P0 equivalent of contracts/schemas/p0-ai-result.schema.json plus bounded text checks. */
public final class AiResultValidator {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> FIELDS = Set.of("schemaVersion", "major", "evidenceIds", "explanation");
    private static final Pattern UNSAFE = Pattern.compile("[<>]|https?://|!\\[|适配度|录取概率|人格|百分之|%", Pattern.CASE_INSENSITIVE);
    private AiResultValidator() {}

    public static AiGateway.Payload validate(String content) {
        if (content == null || content.length() > 32768) throw new AiFailure(AiFailure.Code.INVALID_OUTPUT);
        try {
            JsonNode value = JSON.readTree(content);
            if (value == null || !value.isObject()) throw new AiFailure(AiFailure.Code.INVALID_OUTPUT);
            Set<String> fields = new HashSet<>(); value.fieldNames().forEachRemaining(fields::add);
            JsonNode ids = value.path("evidenceIds"); String text = value.path("explanation").asText("");
            if (!fields.equals(FIELDS) || !value.path("schemaVersion").isTextual() || !"p0-ai-v1".equals(value.path("schemaVersion").textValue())
                || !value.path("major").isTextual() || !"DATA_SCIENCE".equals(value.path("major").textValue())
                || !ids.isArray() || ids.size() != 1 || !ids.get(0).isTextual() || !"synthetic_ev_1".equals(ids.get(0).textValue())
                || !value.path("explanation").isTextual() || text.isEmpty() || text.codePointCount(0,text.length()) > 160 || UNSAFE.matcher(text).find()) throw new AiFailure(AiFailure.Code.INVALID_OUTPUT);
            return new AiGateway.Payload("p0-ai-v1", "DATA_SCIENCE", List.of("synthetic_ev_1"), text);
        } catch (AiFailure error) { throw error; }
        catch (Exception ignored) { throw new AiFailure(AiFailure.Code.INVALID_OUTPUT); }
    }
}
