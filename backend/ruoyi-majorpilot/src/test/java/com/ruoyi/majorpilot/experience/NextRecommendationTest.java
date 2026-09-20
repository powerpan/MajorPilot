package com.ruoyi.majorpilot.experience;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class NextRecommendationTest {
    @Test void explicitStyleOnlyRemainingAndAdjacentOrderMatchFrozenRules(){
        assertEquals("BUSINESS_ANALYTICS",ClosurePipeline.chooseNext("AI",List.of("AI"),"BUSINESS_ACTION").primary());
        assertEquals("EXPLICIT_NEXT_STYLE",ClosurePipeline.chooseNext("AI",List.of("AI"),"BUSINESS_ACTION").reason());
        assertEquals("DATA_SCIENCE",ClosurePipeline.chooseNext("AI",List.of("AI"),"SKIPPED").primary());
        assertEquals("AI",ClosurePipeline.chooseNext("DATA_SCIENCE",List.of("DATA_SCIENCE"),"MODEL_ITERATION").primary());
        assertEquals("BUSINESS_ANALYTICS",ClosurePipeline.chooseNext("DATA_SCIENCE",List.of("DATA_SCIENCE"),"UNSURE").primary());
        assertEquals("ONLY_REMAINING",ClosurePipeline.chooseNext("DATA_SCIENCE",List.of("AI","DATA_SCIENCE"),"MODEL_ITERATION").reason());
        assertEquals("DATA_SCIENCE",ClosurePipeline.chooseNext("BUSINESS_ANALYTICS",List.of("AI","BUSINESS_ANALYTICS"),"BUSINESS_ACTION").primary());
        assertNull(ClosurePipeline.chooseNext("BUSINESS_ANALYTICS",List.of("AI","DATA_SCIENCE","BUSINESS_ANALYTICS"),"MODEL_ITERATION"));
    }
}
