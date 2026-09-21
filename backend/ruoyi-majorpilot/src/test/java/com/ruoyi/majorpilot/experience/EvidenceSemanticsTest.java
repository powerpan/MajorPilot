package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EvidenceSemanticsTest {
    final ObjectMapper mapper=new ObjectMapper();
    @Test void baActionTargetsAndClaimedCommercialEffectsRemainUnverified()throws Exception{
        var input=mapper.readTree("{\"targetSegmentKey\":\"APPLIED\",\"targetChangePercentagePoints\":20,\"actionReason\":\"这一方案已经保证完成率提高20个百分点\",\"guardrailMaximum\":180,\"reviewAfterDays\":28}");
        var items=worker().stepItems("BUSINESS_ANALYTICS","b6-action",9,input,Instant.EPOCH);assertEquals(2,items.size());assertEquals(5,items.getFirst().value().path("submittedAnalysisFieldCount").asInt());assertFalse(items.getFirst().value().has("targetChangePercentagePoints"));
        var analysis=items.getLast();assertEquals("STUDENT_ANALYSIS",analysis.type());assertTrue(analysis.claims().isEmpty());assertEquals(input,analysis.value().path("answers"));assertEquals("UNVERIFIED",analysis.value().path("verificationStatus").asText());
        var raw=mapper.readTree("{\"schemaVersion\":\"ba-result-v1\",\"operationKey\":\"ba-metric\",\"comparison\":{\"rate\":0.5},\"claimedRevenue\":999}");var projected=worker().selectedExecution("BUSINESS_ANALYTICS",raw);assertFalse(projected.has("claimedRevenue"));assertEquals(raw.path("comparison"),projected.path("comparison"));assertTrue(raw.has("claimedRevenue"));
    }
    EvidenceJobs worker(){var runs=mock(RunService.class);when(runs.store()).thenReturn(new RunStore(null,mapper,true,true));return new EvidenceJobs(runs,null);}
    @Test void studentPredictionsAndCausalAssertionsCannotBecomeFactOrReflectionClaims()throws Exception{
        var input=mapper.readTree("{\"confidenceThreshold\":0.55,\"modificationReason\":\"提升是由模型造成的\",\"expectedEffect\":\"准确率一定提高\",\"unrelatedSecret\":\"excluded\"}");
        var items=worker().stepItems("AI","a4-configure",41,input,Instant.EPOCH);
        assertEquals(2,items.size());var fact=items.getFirst();assertEquals(List.of("OBSERVED_FACT"),fact.claims());
        assertEquals(0.55,fact.value().path("confidenceThreshold").asDouble());assertEquals(2,fact.value().path("submittedAnalysisFieldCount").asInt());
        assertFalse(fact.value().toString().contains("提升"));assertFalse(fact.value().has("expectedEffect"));
        var analysis=items.getLast();assertEquals("STUDENT_ANALYSIS",analysis.type());assertTrue(analysis.claims().isEmpty());
        assertEquals("UNVERIFIED",analysis.value().path("verificationStatus").asText());assertEquals("STUDENT_AUTHORED_ANALYSIS",analysis.value().path("attribution").asText());
        assertEquals(input.path("expectedEffect"),analysis.value().path("answers").path("expectedEffect"));assertFalse(analysis.value().toString().contains("excluded"));
        assertEquals(41,analysis.sourceId());assertEquals(Instant.EPOCH,analysis.observedAt());
    }
    @Test void nestedErrorExplanationsAndMonitoringProposalsRemainUnverified()throws Exception{
        var error=mapper.readTree("{\"inspectedSampleIds\":[\"practice-01\"],\"errorPatterns\":[{\"sampleIds\":[\"practice-01\"],\"explanation\":\"这证明因果关系\"}]}");
        var items=worker().stepItems("AI","a3-errors",1,error,Instant.EPOCH);assertFalse(items.getFirst().value().has("errorPatterns"));assertTrue(items.getLast().claims().isEmpty());
        var decision=mapper.readTree("{\"rolloutDecision\":\"LIMITED_PILOT\",\"decisionReason\":\"一定安全\",\"monitoringItems\":[\"不存在风险\"],\"residualRisk\":\"没有风险\"}");
        var finalItems=worker().stepItems("AI","a6-decision",2,decision,Instant.EPOCH);assertEquals("LIMITED_PILOT",finalItems.getFirst().value().path("rolloutDecision").asText());
        assertFalse(finalItems.getFirst().value().has("monitoringItems"));assertEquals(decision.path("monitoringItems"),finalItems.getLast().value().path("answers").path("monitoringItems"));assertTrue(finalItems.getLast().claims().isEmpty());
    }
    @Test void frozenRuleIsReadFromManifestRatherThanCurrentDefault()throws Exception{
        assertEquals("evidence-v2",ClosurePipeline.frozenRule(mapper.readTree("{\"schemaVersion\":\"closed-input-v3\",\"evidenceRuleVersion\":\"evidence-v2\"}")));
        assertEquals("evidence-v1",ClosurePipeline.frozenRule(mapper.readTree("{\"schemaVersion\":\"closed-input-v2\"}")));
        assertEquals("evidence-v99",ClosurePipeline.frozenRule(mapper.readTree("{\"schemaVersion\":\"closed-input-v3\",\"evidenceRuleVersion\":\"evidence-v99\"}")));
        assertEquals("unsupported",ClosurePipeline.frozenRule(mapper.readTree("{\"schemaVersion\":\"closed-input-v3\"}")));
    }
    @Test void dsAnalysisAndAggregateProjectionDoNotPromoteCausalClaimsOrExposeRowDetails()throws Exception{
        var input=mapper.readTree("{\"stratifyBy\":\"course_track\",\"uncertaintyComment\":\"设备导致完成率变化\",\"causalJudgment\":\"CLAIMS_CAUSAL_SUPPORT\"}");
        var items=worker().stepItems("DATA_SCIENCE","d5-stratify",51,input,Instant.EPOCH);assertEquals("course_track",items.getFirst().value().path("stratifyBy").asText());assertFalse(items.getFirst().value().toString().contains("CLAIMS_CAUSAL"));assertTrue(items.getLast().claims().isEmpty());
        var original=mapper.readTree("{\"schemaVersion\":\"ds-result-v1\",\"operationKey\":\"ds-relationship\",\"quality\":{\"duplicateRows\":1,\"duplicateGroups\":[{\"learnerId\":\"synthetic\"}]},\"relationship\":{\"scatter\":{\"n\":2,\"r\":1},\"points\":[{\"rowNumber\":1,\"x\":1,\"y\":1}]},\"unexpectedText\":\"exclude\"}");
        var selected=worker().selectedExecution("DATA_SCIENCE",original);assertFalse(selected.path("quality").has("duplicateGroups"));assertFalse(selected.path("relationship").has("points"));assertFalse(selected.has("unexpectedText"));assertEquals(2,selected.path("relationship").path("scatter").path("n").asInt());assertTrue(original.path("relationship").has("points"),"Projection must not mutate the verified execution source");
    }
}
