package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class RunReceiptCompatibilityTest {
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
