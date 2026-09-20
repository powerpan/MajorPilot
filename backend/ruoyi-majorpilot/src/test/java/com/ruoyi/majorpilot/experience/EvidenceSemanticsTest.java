package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EvidenceSemanticsTest {
    final ObjectMapper mapper=new ObjectMapper();
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
}
