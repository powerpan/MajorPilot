package com.ruoyi.majorpilot.integration.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class MethodReportGatewayTest {
    final ObjectMapper json=new ObjectMapper();
    @Test void wireSchemaPinsCoverageAndActualSourceKeys()throws Exception {
        var input=json.readTree("""
          {"runs":[{}],"checkpoints":[{"checkpointId":"BA-C1","title":"比例"}],"sources":[
          {"ref":"BA-s1","kind":"FINAL","requiredFinding":true,"studentText":true,"checkpointId":"BA-C1","label":"我的解释"},
          {"ref":"BA-s2","kind":"REFLECTION","requiredFinding":false,"studentText":true}]}
          """);
        var gateway=new MethodReportGateway(json,new MockEnvironment());var schema=gateway.wireSchema(input);
        assertEquals(1,schema.at("/properties/nodes/minItems").asInt());assertEquals(1,schema.at("/properties/nodes/maxItems").asInt());
        assertEquals(1,schema.at("/properties/answers/minItems").asInt());assertEquals("BA-s1",schema.at("/properties/answers/items/properties/sourceRef/enum/0").asText());
        assertEquals("BA-s2",schema.at("/properties/preferenceRefs/items/enum/0").asText());assertEquals(0,schema.at("/properties/comparison/maxItems").asInt());
        var requirements=gateway.requirements(input);assertEquals("BA-s1",requirements.at("/nodesInOrder/0/eligibleQuoteRefs/0").asText());assertEquals("BA-s1",requirements.at("/answersInOrder/0/sourceRef").asText());
    }
    @Test void disabledOrMissingKeyFailsBeforeAnyHttpRequest(){
        var gateway=new MethodReportGateway(json,new MockEnvironment());assertFalse(gateway.enabled());assertEquals("CONFIG_INVALID",gateway.call(json.createObjectNode(),null,false).error());
        gateway=new MethodReportGateway(json,new MockEnvironment().withProperty("MP_REPORT_AI_ENABLED","true").withProperty("BAILIAN_BASE_URL",""));assertEquals("CONFIG_INVALID",gateway.call(json.createObjectNode(),null,false).error());
    }
    @Test void independentReviewTargetsKeepEachOriginalTextSeparateFromAdjacentNumericalRecords()throws Exception {
        var input=json.readTree("""
          {"checkpoints":[{"checkpointId":"DS-C1","title":"说明处理规则","criteria":["区分重复和缺失"]}],"sources":[
          {"ref":"text","kind":"FINAL","role":"FINAL","requiredFinding":true,"studentText":true,"checkpointId":"DS-C1","label":"处理数据 · 本地处理说明","value":"今天午饭很好吃。"},
          {"ref":"numbers","kind":"LOCAL_RESULT","requiredFinding":false,"studentText":false,"value":"MATCHED"}]}
          """);
        var targets=new MethodReportGateway(json,new MockEnvironment()).reviewTargets(input);
        assertEquals(1,targets.path("openAnswers").size());assertEquals("今天午饭很好吃。",targets.at("/openAnswers/0/submittedText").asText());
        assertEquals("text",targets.at("/openAnswers/0/sourceRef").asText());assertTrue(targets.at("/openAnswers/0/evaluate").asText().contains("无关文字=INSUFFICIENT"));
        assertTrue(targets.at("/openAnswers/0/localExplanationCriteria").asText().contains("先合计对应人数再相除"));
        assertTrue(targets.at("/openAnswers/0/doNotDowngradeFor").asText().contains("网站看不到本地过程"));
        assertEquals("区分重复和缺失",targets.at("/checkpoints/0/criteria/0").asText());assertEquals(1,targets.at("/checkpoints/0/relatedSubmissions").size());
        assertFalse(MethodReportGateway.instructions(false,false).contains("最后提供的reviewTargets"));
        assertTrue(MethodReportGateway.instructions(true,true).contains("draftValidationErrors为空仅表示结构正确"));
    }
    @Test void changeRequirementsExcludeFinalAndSeparateRevisionFromDifferentQuestion()throws Exception {
        var input=json.readTree("""
          {"checkpoints":[{"checkpointId":"BA-C1"}],"sources":[
          {"ref":"one","checkpointId":"BA-C1","kind":"ATTEMPT","role":"INITIAL","label":"原题"},
          {"ref":"final","checkpointId":"BA-C1","kind":"FINAL","role":"FINAL","label":"原题"}]}
          """);
        var gateway=new MethodReportGateway(json,new MockEnvironment());var n=gateway.requirements(input).at("/nodesInOrder/0");
        assertEquals(1,n.path("allowedChangeStates").size());assertEquals(1,n.path("submittedStages").size());
        assertEquals("one",n.at("/submittedStages/INITIAL/0/sourceRef").asText());
        ((com.fasterxml.jackson.databind.node.ArrayNode)input.path("sources")).addObject().put("ref","new").put("checkpointId","BA-C1").put("kind","ATTEMPT").put("role","TRANSFER").put("label","新题");
        n=gateway.requirements(input).at("/nodesInOrder/0");assertEquals(2,n.path("allowedChangeStates").size());assertEquals("新题",n.at("/submittedStages/TRANSFER/0/questionLabel").asText());assertFalse(n.path("submittedStages").has("FINAL"));
        assertEquals(json.readTree("[\"one\",\"new\"]"),n.path("changeSourceRefsCoveringAllStages"));
    }
    @Test void qualitySettingsDoNotInheritHintBudgetsOrSilentlyClipBadOverrides(){
        var settings=ReportModelSettings.from(new MockEnvironment(),"BAILIAN");assertEquals(900000,settings.requestTimeoutMs());assertEquals(32768,settings.maxOutputTokens());assertEquals(32768,settings.thinkingBudgetTokens());
        assertThrows(AiFailure.class,()->ReportModelSettings.from(new MockEnvironment().withProperty("MP_REPORT_AI_MAX_OUTPUT_TOKENS","1024"),"BAILIAN"));
        assertThrows(AiFailure.class,()->ReportModelSettings.from(new MockEnvironment().withProperty("MP_REPORT_AI_MAX_OUTPUT_TOKENS","65536"),"BAILIAN"));
        assertEquals(65536,ReportModelSettings.defaults("DEEPSEEK").maxOutputTokens());
    }
    @Test void reviewInstructionsExplicitlyCheckDenominatorsAndDoNotConfuseVerificationWithUnderstanding(){
        String review=MethodReportGateway.instructions(true,true);
        assertTrue(review.contains("没有完成课程的人必须留在分母"));
        assertTrue(review.contains("不能仅因NOT_REPRODUCIBLE/OTHER判PARTIAL"));
        assertTrue(review.contains("没有已观察到的困难"));
        assertTrue(review.contains("不能拿数字一致给无关文字SUPPORTED"));
        assertTrue(review.contains("不要把其他题的不足挪来当本节点的不足"));
        assertTrue(review.contains("已满足要求的answers.nextStep优先留空"));
        assertTrue(review.contains("依据原始输入逐句检查"));
        assertTrue(MethodReportGateway.instructions(false,false).endsWith("本轮生成完整初稿。"));
        assertTrue(MethodReportGateway.instructions(false,true).contains("本轮修复未发布初稿"));
    }
}
