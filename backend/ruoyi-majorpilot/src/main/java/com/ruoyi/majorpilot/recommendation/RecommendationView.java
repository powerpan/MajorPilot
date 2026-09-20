package com.ruoyi.majorpilot.recommendation;

import java.time.Instant;
import java.util.List;
import com.ruoyi.majorpilot.intake.DecisionAnswers;
import static com.ruoyi.majorpilot.intake.DecisionAnswers.*;
import static com.ruoyi.majorpilot.recommendation.InitialRecommendationRules.*;

public record RecommendationView(String decisionProfileId,String recommendationId,long profileVersion,
    String questionnaireVersion,String ruleVersion,String explanationVersion,Major primaryMajor,
    List<Major> alternativeMajors,List<Reason> reasons,boolean tieDetected,TieBreakRule tieBreakRule,
    List<MajorDifference> majorDifferences,List<String> supportNotes,String explanationStatus,
    Instant generatedAt,boolean canRegister,String availability) {
    public record MajorDifference(Major majorCode,String name,String description,String availability) {}
    public static List<MajorDifference> majorDifferencesList() { return List.of(
        new MajorDifference(Major.AI,"Artificial Intelligence","关注模型判断、错误模式与有限迭代。","UNAVAILABLE"),
        new MajorDifference(Major.DATA_SCIENCE,"Data Science","关注数据质量、关系分析与不确定性。","UNAVAILABLE"),
        new MajorDifference(Major.BUSINESS_ANALYTICS,"Business Analytics","关注业务指标、优先问题与行动验证。","UNAVAILABLE")); }
    public static RecommendationView create(String profileId,String recommendationId,long version,DecisionAnswers answers,Instant now,boolean canRegister) {
        Result rule=InitialRecommendationRules.recommend(answers);
        var explanation=RecommendationExplanation.deterministic(rule);
        return new RecommendationView(profileId,recommendationId,version,com.ruoyi.majorpilot.intake.Questionnaire.VERSION,RULE_VERSION,EXPLANATION_VERSION,rule.primaryMajor(),rule.alternativeMajors(),explanation.reasons(),rule.tieDetected(),rule.tieBreakRule(),majorDifferencesList(),List.of(
            "专业体验计划提供必要背景、模板和逐层提示；当前基础不会排除任何方向。",
            "本阶段已能保存你的选择，正式任务内容仍在准备中。"),explanation.explanationStatus(),now,canRegister,"UNAVAILABLE");
    }
    public RecommendationView forStudent() { return new RecommendationView(decisionProfileId,recommendationId,profileVersion,questionnaireVersion,ruleVersion,explanationVersion,primaryMajor,alternativeMajors,reasons,tieDetected,tieBreakRule,majorDifferences,supportNotes,explanationStatus,generatedAt,false,availability); }
}
