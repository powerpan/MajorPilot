package com.ruoyi.majorpilot.recommendation;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import java.util.Optional;
import com.ruoyi.majorpilot.intake.IntakeFixtures;
import com.ruoyi.majorpilot.intake.Questionnaire;
import org.junit.jupiter.api.Test;

class RecommendationExplanationTest {
    private final InitialRecommendationRules.Result result=InitialRecommendationRules.recommend(Questionnaire.complete(IntakeFixtures.answers()));
    @Test void disabledProviderAndSimulatedFailureAlwaysReturnFullReviewedExplanation() {
        var baseline=RecommendationExplanation.deterministic(result);
        assertEquals(baseline,RecommendationExplanation.withOptionalPort(result,Optional.empty()));
        assertEquals(baseline,RecommendationExplanation.withOptionalPort(result,Optional.of(context->{throw new IllegalStateException("Synthetic provider unavailable");})));
        assertEquals(2,baseline.reasons().size());assertEquals("STRUCTURED_ONLY",baseline.explanationStatus());
    }
    @Test void replayCannotAddReasonsScoresOrReplaceReviewedProse() {
        var replay=RecommendationExplanation.withOptionalPort(result,Optional.of(context->context.reasons()));assertEquals(result.reasons(),replay.reasons());
        assertEquals(replay,RecommendationExplanation.withOptionalPort(result,Optional.of(context->List.of())));
        assertEquals(result.primaryMajor(),com.ruoyi.majorpilot.intake.DecisionAnswers.Major.AI);
    }
}
