package com.ruoyi.majorpilot.integration.ai;

import java.util.Map;

/** Accepts only explicitly supplied, sanitized fixtures; does not record requests or real responses. */
public final class ReplayAiGateway implements AiGateway {
    private final Map<Request,String> fixtures;
    public ReplayAiGateway(Map<Request,String> fixtures) {
        this.fixtures = Map.copyOf(fixtures);
        this.fixtures.values().forEach(AiResultValidator::validate);
    }
    @Override public Response generate(Request request) {
        String content = fixtures.get(request);
        if (content == null) throw new AiFailure(AiFailure.Code.REPLAY_MISSING);
        return new Response(AiResultValidator.validate(content), new Metadata("REPLAY", "p0-fixture", 0, 0, 0, 0));
    }
}
