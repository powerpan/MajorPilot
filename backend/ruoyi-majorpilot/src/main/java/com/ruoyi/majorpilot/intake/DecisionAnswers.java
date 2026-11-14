package com.ruoyi.majorpilot.intake;

import java.util.List;
import java.util.Map;

/** Validated, immutable questionnaire answers. Only four fields feed ranking. */
public record DecisionAnswers(
    ApplicationStage applicationStage, TargetIntakeWindow targetIntakeWindow,
    List<TargetRegion> targetRegions, CurrentField currentField, String currentFieldText,
    List<Major> consideredMajors, Map<Major, Familiarity> majorFamiliarity,
    Map<FoundationArea, FoundationLevel> foundationSelfView,
    List<ScenarioRank> scenarioPreference, List<WorkElement> workElements,
    List<DecisionUncertainty> decisionUncertainties, String mainQuestion,
    AcquisitionChannel acquisitionChannel) {

    public DecisionAnswers {
        targetRegions = targetRegions == null ? List.of() : List.copyOf(targetRegions);
        consideredMajors = consideredMajors == null ? List.of() : List.copyOf(consideredMajors);
        majorFamiliarity = majorFamiliarity == null ? Map.of() : Map.copyOf(majorFamiliarity);
        foundationSelfView = foundationSelfView == null ? Map.of() : Map.copyOf(foundationSelfView);
        scenarioPreference = scenarioPreference == null ? List.of() : List.copyOf(scenarioPreference);
        workElements = workElements == null ? List.of() : List.copyOf(workElements);
        decisionUncertainties = decisionUncertainties == null ? List.of() : List.copyOf(decisionUncertainties);
    }
    public enum Major { AI, DATA_SCIENCE, BUSINESS_ANALYTICS }
    public enum ApplicationStage { EXPLORING, RESEARCHING_PROGRAMS, PREPARING_APPLICATION, APPLIED, HOLDING_OFFERS }
    public enum TargetIntakeWindow { WITHIN_6_MONTHS, MONTHS_6_TO_12, MONTHS_12_TO_24, AFTER_24_MONTHS, UNSURE }
    public enum TargetRegion { HONG_KONG, SINGAPORE, UNITED_KINGDOM }
    public enum CurrentField { COMPUTING_ENGINEERING, MATHEMATICS_STATISTICS, BUSINESS_ECONOMICS, NATURAL_LIFE_SCIENCES, SOCIAL_HUMANITIES, OTHER }
    public enum Familiarity { UNFAMILIAR, READ_OVERVIEW, COURSE_OR_PROJECT, PRACTICAL_EXPERIENCE }
    public enum FoundationArea { PROGRAMMING, MATHEMATICS_STATISTICS, DATA_ANALYSIS, BUSINESS_PROBLEMS }
    public enum FoundationLevel { UNEXPOSED, BEGINNER, BASIC_TASKS, FAMILIAR }
    public enum WorkElement { CHECK_ERRORS, ADJUST_EXPERIMENTS, CLEAN_DATA, INTERPRET_CHARTS, DEFINE_METRICS, PROPOSE_ACTIONS, COMMUNICATE_CONCLUSIONS }
    public enum DecisionUncertainty { DAILY_WORK, INTEREST, LEARNING_DIFFICULTY, CURRENT_FOUNDATION, MAJOR_DIFFERENCES, FUTURE_DEVELOPMENT }
    public enum AcquisitionChannel { FRIEND_OR_CLASSMATE, SOCIAL_MEDIA, SEARCH, COMMUNITY, OTHER, DECLINED }
    public record ScenarioRank(Major majorCode, int rank) {}
}
