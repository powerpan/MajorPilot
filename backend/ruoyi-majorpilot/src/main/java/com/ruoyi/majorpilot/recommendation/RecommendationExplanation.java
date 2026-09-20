package com.ruoyi.majorpilot.recommendation;

import java.util.List;
import java.util.Optional;
import com.ruoyi.majorpilot.intake.DecisionAnswers.Major;
import static com.ruoyi.majorpilot.recommendation.InitialRecommendationRules.*;

/** Business-specific optional explanation boundary; no live provider is wired in P1. */
public final class RecommendationExplanation {
    public record Context(Major primaryMajor,String ruleVersion,List<Reason> reasons) {}
    public record Presentation(List<Reason> reasons,String explanationStatus) {}
    @FunctionalInterface public interface Port { List<Reason> polish(Context context); }
    private RecommendationExplanation() {}
    public static Presentation deterministic(Result result) { return new Presentation(result.reasons(),"STRUCTURED_ONLY"); }
    /** Used with fake/replay adapters to exercise failure recovery without invoking any paid model. */
    public static Presentation withOptionalPort(Result result,Optional<Port> provider) {
        if(provider.isEmpty())return deterministic(result);
        try {
            var output=provider.get().polish(new Context(result.primaryMajor(),RULE_VERSION,result.reasons()));
            // P1 has no reviewed real-provider explanation validator. Only verbatim reviewed
            // template replays are acceptable; arbitrary model prose remains disabled.
            if(!result.reasons().equals(output))return deterministic(result);
            return new Presentation(List.copyOf(output),"STRUCTURED_ONLY");
        } catch(RuntimeException unavailable) { return deterministic(result); }
    }
}
