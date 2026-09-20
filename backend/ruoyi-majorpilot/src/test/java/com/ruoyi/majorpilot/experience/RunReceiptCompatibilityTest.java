package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class RunReceiptCompatibilityTest {
    @Test void preV6SafeReceiptsRemainStandardAndHaveEmptySourceBindings()throws Exception{
        var mapper=new ObjectMapper().findAndRegisterModules();var run=mapper.readValue("{\"runId\":\"synthetic\",\"contentKind\":\"DEMO\"}",RunDtos.Run.class);assertEquals("STANDARD",run.runMode());
        var execution=mapper.readValue("{\"executionId\":\"synthetic\",\"inputRevision\":1,\"appliedToRevision\":2}",RunDtos.Execution.class);assertEquals(Map.of(),execution.sourceRevisions());assertEquals(Map.of(),execution.appliedSourceRevisions());
        var stale=mapper.readValue("{\"sourceRevisions\":{\"a4-configure\":1},\"appliedToRevision\":null,\"appliedSourceRevisions\":null}",RunDtos.Execution.class);assertNull(stale.appliedSourceRevisions());
    }
}
