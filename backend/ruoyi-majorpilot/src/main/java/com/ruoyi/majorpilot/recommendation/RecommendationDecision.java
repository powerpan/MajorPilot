package com.ruoyi.majorpilot.recommendation;

import java.time.Instant;
import com.ruoyi.majorpilot.intake.DecisionAnswers.Major;

public record RecommendationDecision(String decisionId,String recommendationId,long decisionNo,String decisionType,
    Major recommendedMajor,Major selectedMajorCode,String overrideReasonCode,String overrideText,
    Instant decidedAt,String availability) {
    public enum OverrideReason { ALREADY_PREFERRED, FAMILIAR_FIRST, UNFAMILIAR_FIRST, TIME_OR_FORMAT, OTHER, DECLINED }
}
