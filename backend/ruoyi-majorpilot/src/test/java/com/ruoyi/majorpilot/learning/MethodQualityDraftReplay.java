package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.shared.CanonicalJson;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Explicit quality-research checkpoint reuse only; never part of the application JAR. */
final class MethodQualityDraftReplay {
    static final String INITIAL_PIPELINE_SHA="e04115c8d7ce4b4efff2579a43b6c9438c7ba2cf7bc0ba5e8e34a9ca3c480341";
    static void verifyInitialPipeline(String gatewaySource)throws Exception {
        int review=gatewaySource.indexOf("    private static final String REVIEW=");
        require(review>0,"Missing independent-review boundary");
        String prefix=gatewaySource.substring(0,review).replace("            if(review)material.set(\"reviewTargets\",reviewTargets(input));\n","");
        String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(prefix.getBytes(StandardCharsets.UTF_8)));
        require(hash.equals(INITIAL_PIPELINE_SHA),"Initial gateway changed: make a fresh initial call, do not reuse a prior draft");
    }
    static JsonNode reuse(ObjectMapper json,JsonNode input,JsonNode prior,ObjectNode evidence){
        require(MethodReportContract.PROMPT.equals("method-report-prompt-v9"),"Reuse is limited to the reviewed v6/v7/v8-to-v9 transition");
        require(prior.path("syntheticOnly").asBoolean()&&Set.of("method-report-prompt-v6","method-report-prompt-v7","method-report-prompt-v8").contains(prior.path("promptVersion").asText()),"Only exact synthetic v6/v7/v8 drafts may be reused");
        require(prior.path("case").equals(evidence.path("case")),"Different case");
        require(prior.path("provider").asText().equals("BAILIAN")&&prior.path("model").asText().equals("qwen3.8-max-0902"),"Different provider or model");
        require(prior.path("provider").equals(evidence.path("provider"))&&prior.path("model").equals(evidence.path("model")),"Current provider or model changed");
        require(CanonicalJson.hash(json,input).equals(prior.path("inputSha256").asText()),"Different frozen input");
        var draft=prior.path("draft");require(!draft.isNull()&&!draft.isMissingNode()&&MethodReportContract.validate(input,draft).isEmpty(),"Draft is not structurally valid");
        var calls=evidence.withArray("calls");require(calls.isEmpty(),"Do not mix unrelated calls");
        require(prior.path("calls").isArray()&&prior.path("calls").size()<=3,"Invalid prior call history");
        for(var old:prior.path("calls")){
            if(old.path("stage").asText().equals("REVIEW"))break;
            require(old.path("error").isNull(),"A failed request cannot supply a reusable draft");
            var copy=(ObjectNode)old.deepCopy();if(!copy.has("promptVersion"))copy.put("promptVersion",prior.path("promptVersion").asText());calls.add(copy);
        }
        require(calls.size()>=1&&calls.size()<=2&&calls.get(0).path("stage").asText().equals("INITIAL")&&(calls.size()==1||calls.get(1).path("stage").asText().equals("REPAIR")),"Invalid initial/repair history");
        evidence.putObject("reusedDraftFrom").put("promptVersion",prior.path("promptVersion").asText()).put("initialPromptVersion",calls.get(0).path("promptVersion").asText()).put("canonicalOutputSha256",CanonicalJson.hash(json,prior)).put("draftSha256",CanonicalJson.hash(json,draft)).put("initialPipelineSha256",INITIAL_PIPELINE_SHA).put("priorCompletedRequests",prior.path("calls").size()).put("newRequestBudget",1);
        return draft.deepCopy();
    }
    private static void require(boolean condition,String message){if(!condition)throw new IllegalArgumentException(message);}
}
