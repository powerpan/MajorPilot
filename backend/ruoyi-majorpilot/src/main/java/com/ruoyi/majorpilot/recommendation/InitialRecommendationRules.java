package com.ruoyi.majorpilot.recommendation;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import com.ruoyi.majorpilot.intake.DecisionAnswers;
import static com.ruoyi.majorpilot.intake.DecisionAnswers.*;

/** Reviewed lexicographic experience-order rule. No suitability score or eligibility filter. */
public final class InitialRecommendationRules {
    public static final String RULE_VERSION = "initial-recommendation-v1";
    public static final String EXPLANATION_VERSION = "initial-template-v1";
    public enum TieBreakRule { RANK, CONSIDERED, STRONG_COUNT, MEDIUM_COUNT, FAMILIARITY, FIXED_ORDER }
    public enum ReasonType { RANKING, CONTEXT, BOUNDARY }
    public enum ReasonCode { SCENARIO_FIRST_AI, SCENARIO_FIRST_DS, SCENARIO_FIRST_BA, SCENARIO_TIED, CURRENTLY_CONSIDERING, WORK_STYLE_ALIGNMENT, HIGH_EXPLORATION_VALUE, TIE_BREAK_BASELINE, EXPERIENCE_ORDER_ONLY }
    public record Reason(ReasonCode code, ReasonType reasonType, Major majorCode, List<String> sourceQuestionKeys, String text) {}
    public record Result(Major primaryMajor, List<Major> alternativeMajors, boolean tieDetected, TieBreakRule tieBreakRule, List<Reason> reasons) {}
    private record Candidate(Major major, List<Integer> tuple) {}
    private static final List<Major> BASELINE = List.of(Major.DATA_SCIENCE, Major.AI, Major.BUSINESS_ANALYTICS);
    // Rows follow WorkElement declaration; columns follow Major (AI, DS, BA). 2=strong,1=medium,0=weak.
    private static final int[][] RELATION = {{2,1,0},{2,1,1},{0,2,1},{1,2,2},{0,1,2},{1,1,2},{1,2,2}};
    private InitialRecommendationRules() {}
    public static Result recommend(DecisionAnswers answers) {
        List<Candidate> candidates = new ArrayList<>();
        for (Major major : Major.values()) {
            int rank = answers.scenarioPreference().stream().filter(s -> s.majorCode() == major).findFirst().orElseThrow().rank();
            boolean considered = answers.consideredMajors().contains(major);
            int strong = count(answers, major, 2), medium = count(answers, major, 1);
            candidates.add(new Candidate(major, List.of(rank, considered ? 0 : 1, -strong, -medium, considered ? answers.majorFamiliarity().get(major).ordinal() : 4, BASELINE.indexOf(major))));
        }
        candidates.sort((a,b) -> { for (int i=0;i<a.tuple().size();i++) { int compared=Integer.compare(a.tuple().get(i),b.tuple().get(i));if(compared!=0)return compared; } return 0; });
        Candidate winner = candidates.get(0), runnerUp = candidates.get(1);
        int decisive = 0;
        while (winner.tuple().get(decisive).equals(runnerUp.tuple().get(decisive))) decisive++;
        TieBreakRule rule = TieBreakRule.values()[decisive];
        boolean tied = candidates.stream().filter(c -> c.tuple().get(0).equals(winner.tuple().get(0))).count() > 1;
        Major major = winner.major();
        List<Reason> reasons = new ArrayList<>();
        ReasonCode first = tied ? ReasonCode.SCENARIO_TIED : switch (major) { case AI -> ReasonCode.SCENARIO_FIRST_AI; case DATA_SCIENCE -> ReasonCode.SCENARIO_FIRST_DS; case BUSINESS_ANALYTICS -> ReasonCode.SCENARIO_FIRST_BA; };
        reasons.add(reason(first, ReasonType.RANKING, major));
        if (tied) reasons.add(reason(switch (rule) {
            case CONSIDERED -> ReasonCode.CURRENTLY_CONSIDERING;
            case STRONG_COUNT, MEDIUM_COUNT -> ReasonCode.WORK_STYLE_ALIGNMENT;
            case FAMILIARITY -> ReasonCode.HIGH_EXPLORATION_VALUE;
            case FIXED_ORDER -> ReasonCode.TIE_BREAK_BASELINE;
            case RANK -> throw new IllegalStateException("Tied candidates cannot be separated by rank");
        }, ReasonType.RANKING, major));
        if (answers.consideredMajors().contains(major) && reasons.stream().noneMatch(r -> r.code() == ReasonCode.CURRENTLY_CONSIDERING)) {
            reasons.add(reason(ReasonCode.CURRENTLY_CONSIDERING, ReasonType.CONTEXT, major));
        } else if (count(answers, major, 2) + count(answers, major, 1) > 0 && reasons.stream().noneMatch(r -> r.code() == ReasonCode.WORK_STYLE_ALIGNMENT)) {
            reasons.add(reason(ReasonCode.WORK_STYLE_ALIGNMENT, ReasonType.CONTEXT, major));
        }
        reasons.add(reason(ReasonCode.EXPERIENCE_ORDER_ONLY, ReasonType.BOUNDARY, major));
        return new Result(major, candidates.stream().skip(1).map(Candidate::major).toList(), tied, rule, List.copyOf(reasons));
    }
    private static int count(DecisionAnswers answers, Major major, int strength) { return (int) answers.workElements().stream().filter(w -> RELATION[w.ordinal()][major.ordinal()] == strength).count(); }
    private static Reason reason(ReasonCode code, ReasonType type, Major major) {
        String text = switch (code) {
            case SCENARIO_FIRST_AI -> "你最想先体验检查和改进模型行为。";
            case SCENARIO_FIRST_DS -> "你最想先体验用数据检验判断。";
            case SCENARIO_FIRST_BA -> "你最想先体验把指标变化转成行动。";
            case SCENARIO_TIED -> "你把这个方向与其他情境列为同等优先。";
            case CURRENTLY_CONSIDERING -> "你已经把这个方向列入考虑范围。";
            case WORK_STYLE_ALIGNMENT -> "你选择的工作环节与这个体验的内容重合较多。";
            case HIGH_EXPLORATION_VALUE -> "你正在考虑这个方向，但目前了解较少，先体验有助于减少未知。";
            case TIE_BREAK_BASELINE -> "多个方向的排序信号相同，先建立一个可比较的体验基准。";
            case EXPERIENCE_ORDER_ONLY -> "本建议只安排尝试顺序，不是专业适配判断；你可以自由改选。";
        };
        List<String> source = switch (code) {
            case SCENARIO_FIRST_AI, SCENARIO_FIRST_DS, SCENARIO_FIRST_BA, SCENARIO_TIED -> List.of("scenarioPreference");
            case CURRENTLY_CONSIDERING -> List.of("consideredMajors");
            case WORK_STYLE_ALIGNMENT -> List.of("workElements");
            case HIGH_EXPLORATION_VALUE -> List.of("consideredMajors", "majorFamiliarity");
            case TIE_BREAK_BASELINE, EXPERIENCE_ORDER_ONLY -> List.of();
        };
        return new Reason(code, type, major, source, text);
    }
}
