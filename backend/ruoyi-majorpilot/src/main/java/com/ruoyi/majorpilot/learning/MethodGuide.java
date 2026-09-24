package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.content.TaskContentRepository;
import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Immutable teaching contract, distinct from historical task editions. */
public final class MethodGuide {
    private MethodGuide() {}
    public static boolean enabled(JsonNode manifest) {
        for (var a : manifest.path("assets")) if (a.path("assetKey").asText().equals("method-guide")) return true;
        return false;
    }
    public static LearningTimeline.Definition definition(JsonNode guide) {
        if (!guide.path("schemaVersion").asText().equals("method-guide-v1")) throw invalid();
        var checkpoints = new ArrayList<LearningTimeline.Checkpoint>();
        for (var c : guide.path("checkpoints")) {
            var supports = new ArrayList<LearningTimeline.Support>();
            for (var s : c.path("supports")) {
                if (!TaskContentRepository.hash(s.path("text").asText().getBytes(StandardCharsets.UTF_8)).equals(s.path("sha256").asText())) throw invalid();
                supports.add(new LearningTimeline.Support(s.path("supportId").asText(), s.path("version").asText(), s.path("sha256").asText(), LearningTimeline.SupportKind.valueOf(s.path("kind").asText())));
            }
            checkpoints.add(new LearningTimeline.Checkpoint(c.path("checkpointId").asText(), c.path("stepKey").asText(), c.path("answerSchema"), c.path("transferQuestionId").asText(null), c.path("transferStepKey").asText(null), c.path("transferSchema").isNull() ? null : c.path("transferSchema"), supports));
        }
        return new LearningTimeline.Definition(guide.path("methodVersion").asText(), checkpoints);
    }
    public static void validate(JsonNode manifest, JsonNode guide) {
        var definition = definition(guide);
        if (manifest.path("steps").size() != 6 || guide.path("steps").size() != 6 || !manifest.path("versionCode").asText().equals("2.0.0")) throw invalid();
        for (var c : definition.checkpoints()) {
            if (!step(manifest.path("steps"), c.stepKey()).path("inputSchema").equals(c.answerSchema())) throw invalid();
            if (c.transferStepKey() != null && !step(manifest.path("steps"), c.transferStepKey()).path("inputSchema").equals(c.transferSchema())) throw invalid();
        }
        for (var s : manifest.path("steps")) if (!step(guide.path("steps"), s.path("stepKey").asText()).path("introduction").equals(s.path("instructions"))) throw invalid();
    }
    public static JsonNode step(JsonNode steps, String key) {
        for (var s : steps) if (s.path("stepKey").asText().equals(key)) return s;
        throw invalid();
    }
    private static ApiException invalid() { return new ApiException(503, "CONTENT_INTEGRITY_FAILED"); }
}
