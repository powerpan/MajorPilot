package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ExecutionBindingsTest {
    private final ObjectMapper mapper=new ObjectMapper();
    @Test void ancestorReachabilityIsTransitiveNotOnlyTheImmediateDependency()throws Exception{
        var steps=mapper.readTree("[{\"stepKey\":\"quality\",\"dependencies\":[]},{\"stepKey\":\"profile\",\"dependencies\":[\"quality\"]},{\"stepKey\":\"relationship\",\"dependencies\":[\"profile\"]},{\"stepKey\":\"other\",\"dependencies\":[]}]");
        assertTrue(ExecutionBindings.isAncestor(steps,"relationship","quality"));assertTrue(ExecutionBindings.isAncestor(steps,"relationship","profile"));assertFalse(ExecutionBindings.isAncestor(steps,"relationship","relationship"));assertFalse(ExecutionBindings.isAncestor(steps,"relationship","other"));
    }
    @Test void missingBindingIsOptionalOnlyWhenThePropertyIsDeclaredAndNotRequired()throws Exception{
        var schema=mapper.readTree("{\"properties\":{\"mode\":{},\"x\":{}},\"required\":[\"mode\"]}");assertFalse(ExecutionBindings.optional(schema,"mode"));assertTrue(ExecutionBindings.optional(schema,"x"));assertFalse(ExecutionBindings.optional(schema,"notDeclared"));
    }
    @Test void sourceCasRequiresExactValidMapForV3AndRemainsOptionalForLegacy(){
        var actual=Map.of("d2-quality",2L,"d4-relationship",3L);
        assertDoesNotThrow(()->ExecutionService.checkExpectedSources(null,actual,false));assertDoesNotThrow(()->ExecutionService.checkExpectedSources(actual,actual,true));assertDoesNotThrow(()->ExecutionService.checkExpectedSources(Map.of(),Map.of(),true));
        error("VALIDATION_ERROR",()->ExecutionService.checkExpectedSources(null,actual,true));error("VALIDATION_ERROR",()->ExecutionService.checkExpectedSources(Map.of("d2-quality",0L),actual,true));
        error("EXECUTION_REVISION_STALE",()->ExecutionService.checkExpectedSources(Map.of("d2-quality",2L),actual,true));error("EXECUTION_REVISION_STALE",()->ExecutionService.checkExpectedSources(Map.of("d2-quality",1L,"d4-relationship",3L),actual,true));error("EXECUTION_REVISION_STALE",()->ExecutionService.checkExpectedSources(Map.of("extra",1L),Map.of(),true));
    }
    private static void error(String code,org.junit.jupiter.api.function.Executable action){assertEquals(code,assertThrows(ApiException.class,action).code);}
}
