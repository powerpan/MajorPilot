package com.ruoyi.majorpilot.learning;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.shared.CanonicalJson;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MethodReportFactsTest {
    final ObjectMapper json=new ObjectMapper();
    ObjectNode input(String status){var input=json.createObjectNode();var answer=input.putArray("runs").addObject().put("majorCode","DATA_SCIENCE").putArray("finalAnswers").addObject().put("stepKey","step").put("title","比较人数").putObject("answer");var local=answer.putObject("local").put("reason","我的说明");var record=json.createObjectNode().put("stepKey","step").put("assistance",false).put("answerSha256",CanonicalJson.hash(json,local));record.putObject("result").put("status",status);input.putArray("sources").addObject().put("kind","LOCAL_RESULT").put("majorCode","DATA_SCIENCE").put("value",record.toString());return input;}
    @Test void unreproducibleNumbersRemainSelfReportedWithoutPenalizingTheExplanation(){var rows=MethodReportFacts.calculationConditions(json,input("NOT_REPRODUCIBLE"));assertEquals("NOT_REPRODUCIBLE",rows.at("/0/verificationStatus").asText());assertTrue(rows.at("/0/description").asText().contains("网站没有确认它们正确"));assertTrue(rows.at("/0/description").asText().contains("不等于你的方法或解释有错"));}
    @Test void changedFinalInputCannotReuseAnOlderNumericCheck(){var input=input("MATCHED");((ObjectNode)input.at("/runs/0/finalAnswers/0/answer/local")).put("reason","修改了说明");var rows=MethodReportFacts.calculationConditions(json,input);assertEquals("NOT_CHECKED",rows.at("/0/verificationStatus").asText());assertTrue(rows.at("/0/description").asText().contains("未找到与最后这份填写匹配"));}
    @Test void assistanceAndNumericalVerificationAreDistinct(){var input=input("MATCHED");var assistance=json.createObjectNode().put("stepKey","step").put("assistance",true);input.withArray("sources").addObject().put("kind","LOCAL_RESULT").put("majorCode","DATA_SCIENCE").put("value",assistance.toString());String text=MethodReportFacts.calculationConditions(json,input).at("/0/description").asText();assertTrue(text.contains("不证明文字解释正确"));assertTrue(text.contains("请求过网站计算帮助"));assertFalse(text.contains("没有记录本步骤"));}
    @Test void mismatchesAndVersionProblemsAreDisclosedAndOtherMajorsCannotSupplyVerification(){for(String status:new String[]{"MISMATCHED","VERSION_MISMATCH","NOT_CHECKED"})assertEquals(status,MethodReportFacts.calculationConditions(json,input(status)).at("/0/verificationStatus").asText());var input=input("MATCHED");((ObjectNode)input.at("/sources/0")).put("majorCode","BUSINESS_ANALYTICS");assertEquals("NOT_CHECKED",MethodReportFacts.calculationConditions(json,input).at("/0/verificationStatus").asText());}
    @Test void oldRecordsWithoutLocalAnswersRemainReadable(){var input=json.createObjectNode();input.putArray("runs").addObject().put("majorCode","AI");assertTrue(MethodReportFacts.calculationConditions(json,input).isEmpty());}
}
