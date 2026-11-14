package com.ruoyi.majorpilot.intake;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.Map;

/** Submitted answers are self-reports, never ability or suitability scores. */
public record DecisionProfileView(String decisionProfileId,long profileVersion,String questionnaireVersion,
    Instant submittedAt,ObjectNode answers,Map<String,String> answerStates,boolean complete,boolean recommendationReady) {}
