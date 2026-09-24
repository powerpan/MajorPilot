package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.shared.CanonicalJson;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MethodQualityDraftReplayTest {
    final ObjectMapper json=new ObjectMapper();
    ObjectNode prior(JsonNode input){var p=json.createObjectNode().put("case","Q01").put("syntheticOnly",true).put("promptVersion","method-report-prompt-v6").put("provider","BAILIAN").put("model","qwen3.8-max-0902").put("inputSha256",CanonicalJson.hash(json,input));p.set("draft",MethodReportContractTest.proposal(json,input));p.putArray("calls").addObject().put("stage","INITIAL").putNull("error");return p;}
    ObjectNode evidence(){return json.createObjectNode().put("case","Q01").put("provider","BAILIAN").put("model","qwen3.8-max-0902");}
    @Test void preservesRealInitialProvenanceAndRequiresOneNewIndependentReview(){var input=new MethodReportContractTest().input();var p=prior(input);var e=evidence();var draft=MethodQualityDraftReplay.reuse(json,input,p,e);assertEquals(p.path("draft"),draft);assertEquals("method-report-prompt-v6",e.at("/calls/0/promptVersion").asText());assertEquals(1,e.at("/reusedDraftFrom/newRequestBudget").asInt());assertEquals(CanonicalJson.hash(json,p),e.at("/reusedDraftFrom/canonicalOutputSha256").asText());assertFalse(e.has("reviewed"));}
    @Test void earlierReviewVersionNeverRelabelsTheOriginalInitialCall(){var input=new MethodReportContractTest().input();var p=prior(input);p.put("promptVersion","method-report-prompt-v7");((ObjectNode)p.at("/calls/0")).put("promptVersion","method-report-prompt-v6");p.withArray("calls").addObject().put("stage","REVIEW").put("promptVersion","method-report-prompt-v7").putNull("error");var e=evidence();MethodQualityDraftReplay.reuse(json,input,p,e);assertEquals(1,e.path("calls").size());assertEquals("method-report-prompt-v6",e.at("/calls/0/promptVersion").asText());assertEquals("method-report-prompt-v7",e.at("/reusedDraftFrom/promptVersion").asText());assertEquals("method-report-prompt-v6",e.at("/reusedDraftFrom/initialPromptVersion").asText());}
    @Test void rejectsOtherInputsProvidersVersionsInvalidDraftsAndFailedRequests(){var input=new MethodReportContractTest().input();for(String key:new String[]{"provider","model","promptVersion","inputSha256","case"}){var p=prior(input);p.put(key,"different");assertThrows(IllegalArgumentException.class,()->MethodQualityDraftReplay.reuse(json,input,p,evidence()));}var p=prior(input);p.putNull("draft");assertThrows(IllegalArgumentException.class,()->MethodQualityDraftReplay.reuse(json,input,p,evidence()));var failed=prior(input);((ObjectNode)failed.at("/calls/0")).put("error","TIMEOUT");assertThrows(IllegalArgumentException.class,()->MethodQualityDraftReplay.reuse(json,input,failed,evidence()));}
    @Test void onlyTheReviewTextMayChangeBeforeDraftReuse()throws Exception {String source=Files.readString(Path.of("src/main/java/com/ruoyi/majorpilot/integration/ai/MethodReportGateway.java"));MethodQualityDraftReplay.verifyInitialPipeline(source);assertThrows(IllegalArgumentException.class,()->MethodQualityDraftReplay.verifyInitialPipeline(source.replace("本轮生成完整初稿。","不同的初稿要求")));}
}
