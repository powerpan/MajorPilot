package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.ruoyi.majorpilot.shared.CanonicalJson;
import java.util.Set;

/** Record-derived boundaries, never generated or certified by a language model. */
public final class MethodReportFacts {
    private MethodReportFacts() {}
    public static ArrayNode calculationConditions(ObjectMapper json,JsonNode input){
        var out=json.createArrayNode();
        for(var run:input.path("runs"))for(var answer:run.path("finalAnswers")){
            if(!answer.path("answer").has("local"))continue;
            String step=answer.path("stepKey").asText(),major=run.path("majorCode").asText(),hash=CanonicalJson.hash(json,answer.at("/answer/local"));
            String status="NOT_CHECKED";boolean matchedRecord=false,assistance=false;
            for(var source:input.path("sources")){
                if(!source.path("majorCode").asText().equals(major)||!source.path("kind").asText().equals("LOCAL_RESULT"))continue;
                final JsonNode record;try{record=json.readTree(source.path("value").asText());}catch(Exception invalid){continue;}
                if(record==null||!record.path("stepKey").asText().equals(step))continue;
                if(record.path("assistance").asBoolean()){assistance=true;continue;}
                if(!record.path("answerSha256").asText().equals(hash))continue;
                String value=record.at("/result/status").asText();
                if(Set.of("MATCHED","MISMATCHED","NOT_REPRODUCIBLE","VERSION_MISMATCH","NOT_CHECKED").contains(value)){status=value;matchedRecord=true;}
            }
            String text=!matchedRecord?"未找到与最后这份填写匹配的核对记录，数值只能按你的回填阅读。":switch(status){
                case "MATCHED"->"你最后回填的数值与按所选规则计算的结果一致；这不证明文字解释正确，也不证明本地 Excel 操作过程。";
                case "MISMATCHED"->"你最后回填的部分数值与网站复算不同。原值仍保留；仅凭差异不能确定是范围、计算还是理解问题。";
                case "NOT_REPRODUCIBLE"->"这套本地方法暂时不能在网站复算。相关数值仍是你的自报，网站没有确认它们正确；这不等于你的方法或解释有错。";
                case "VERSION_MISMATCH"->"填写的工作簿版本与当前体验不同，相关数值没有被确认。不能套用当前文件的结果判断旧文件。";
                default->"这次没有完成数值核对；相关数值仍是你的回填，不能把技术上的未核对当成答错。";
            };
            text+=assistance?" 过程中你请求过网站计算帮助，不能把这些帮助算成独立完成。":" 记录来自你的网页回填，网站没有观察本地操作，也没有记录本步骤的网站计算帮助；不能据此认定完全独立完成。";
            out.addObject().put("majorCode",major).put("stepTitle",answer.path("title").asText()).put("verificationStatus",status).put("description",text);
        }
        return out;
    }
}
