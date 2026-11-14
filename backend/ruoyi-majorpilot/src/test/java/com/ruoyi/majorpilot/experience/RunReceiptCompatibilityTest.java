package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class RunReceiptCompatibilityTest {
    @Test void directSelectionDoesNotChangeLegacyCreateFingerprints()throws Exception{
        var mapper=new ObjectMapper();String legacy="{\"decisionId\":\"synthetic\",\"demoKey\":null,\"expectedRevision\":0}";
        assertEquals(legacy,mapper.writeValueAsString(mapper.readValue(legacy,RunDtos.Create.class)));assertEquals(legacy,mapper.writeValueAsString(new RunDtos.Create("synthetic",null,0L)));
        assertEquals("AI",mapper.valueToTree(new RunDtos.Create(null,null,null,"AI")).path("majorCode").asText());
    }
    @Test void absentStepSourceExpectationKeepsLegacyCompletionFingerprintAndStepShape()throws Exception{
        var mapper=new ObjectMapper();var old=new RunDtos.Revision(2L);var input=mapper.readValue("{\"expectedRevision\":2}",RunDtos.StepCompletion.class);
        assertNull(input.expectedSourceRevisions());assertEquals(mapper.writeValueAsString(old),mapper.writeValueAsString(input));
        assertEquals(mapper.writeValueAsString(old),mapper.writeValueAsString(new RunDtos.StepCompletion(2L)));
        assertFalse(mapper.valueToTree(new RunDtos.Step("old","IN_PROGRESS",0,"v1",mapper.createObjectNode(),mapper.createObjectNode(),false,null,java.util.List.of(),java.util.List.of())).has("baActionContext"));
        assertTrue(mapper.valueToTree(new RunDtos.StepCompletion(2L,Map.of("b2-metric",1L,"b3-funnel",1L,"b4-segment",1L))).has("expectedSourceRevisions"));
    }
    @Test void absentSourceExpectationKeepsLegacyExecutionFingerprintShape()throws Exception{
        var mapper=new ObjectMapper();var old=mapper.readTree("{\"operationKey\":\"demo-summary-v1\",\"inputRevision\":1,\"parameters\":{},\"inputSha256\":null,\"observedResult\":null}");
        var input=mapper.treeToValue(old,RunDtos.Execute.class);assertNull(input.expectedSourceRevisions());assertEquals(old.toString(),mapper.writeValueAsString(input));
        assertEquals(old.toString(),mapper.writeValueAsString(new RunDtos.Execute("demo-summary-v1",1L,mapper.createObjectNode(),null,null)));
        var v3=mapper.valueToTree(new RunDtos.Execute("ds-quality-clean",1L,mapper.createObjectNode(),null,null,Map.of()));assertTrue(v3.path("expectedSourceRevisions").isObject());assertTrue(v3.path("expectedSourceRevisions").isEmpty());
    }
    @Test void preV6SafeReceiptsRemainStandardAndHaveEmptySourceBindings()throws Exception{
        var mapper=new ObjectMapper().findAndRegisterModules();var run=mapper.readValue("{\"runId\":\"synthetic\",\"contentKind\":\"DEMO\"}",RunDtos.Run.class);assertEquals("STANDARD",run.runMode());
        var execution=mapper.readValue("{\"executionId\":\"synthetic\",\"inputRevision\":1,\"appliedToRevision\":2}",RunDtos.Execution.class);assertEquals(Map.of(),execution.sourceRevisions());assertEquals(Map.of(),execution.appliedSourceRevisions());
        var stale=mapper.readValue("{\"sourceRevisions\":{\"a4-configure\":1},\"appliedToRevision\":null,\"appliedSourceRevisions\":null}",RunDtos.Execution.class);assertNull(stale.appliedSourceRevisions());
    }
}
