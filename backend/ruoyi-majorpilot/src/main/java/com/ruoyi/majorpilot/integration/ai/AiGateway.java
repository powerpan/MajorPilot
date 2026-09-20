package com.ruoyi.majorpilot.integration.ai;

import java.util.List;
import java.util.Objects;

/** Vendor-neutral P0 boundary. Only a fixed synthetic fixture is supported, not real reports. */
public interface AiGateway {
    Response generate(Request request);

    enum Workload { HINT, REFLECTION_QUESTION, EXPERIENCE_REPORT, INITIAL_RECOMMENDATION_EXPLANATION }

    record Request(Workload workload, String promptVersion) {
        public Request {
            Objects.requireNonNull(workload, "workload");
            if (!"p0-synthetic-v1".equals(promptVersion)) throw new AiFailure(AiFailure.Code.INVALID_INPUT);
        }
    }

    record Payload(String schemaVersion, String major, List<String> evidenceIds, String explanation) {
        public Payload { evidenceIds = List.copyOf(evidenceIds); }
    }

    record Metadata(String mode, String model, int attempts, long elapsedMs, long promptTokens, long completionTokens) {}
    record Response(Payload payload, Metadata metadata) {}
}
