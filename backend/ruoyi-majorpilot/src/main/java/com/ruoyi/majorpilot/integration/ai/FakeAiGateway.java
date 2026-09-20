package com.ruoyi.majorpilot.integration.ai;

public final class FakeAiGateway implements AiGateway {
    public static final String FIXTURE = "{\"schemaVersion\":\"p0-ai-v1\",\"major\":\"DATA_SCIENCE\",\"evidenceIds\":[\"synthetic_ev_1\"],\"explanation\":\"先尝试数据清理；这只是体验顺序建议。\"}";
    @Override public Response generate(Request request) {
        if (request == null) throw new AiFailure(AiFailure.Code.INVALID_INPUT);
        return new Response(AiResultValidator.validate(FIXTURE), new Metadata("FAKE", "p0-fixture", 0, 0, 0, 0));
    }
}
