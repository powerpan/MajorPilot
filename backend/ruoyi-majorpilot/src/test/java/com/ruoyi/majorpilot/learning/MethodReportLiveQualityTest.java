package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.integration.ai.MethodReportGateway;
import com.ruoyi.majorpilot.shared.CanonicalJson;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.env.StandardEnvironment;
import static org.junit.jupiter.api.Assertions.*;

/** Explicit bounded synthetic semantic probes; ordinary builds never enter this class. */
@EnabledIfEnvironmentVariable(named="MP_METHOD_LIVE",matches="true")
class MethodReportLiveQualityTest {
    @Test void syntheticCasesReceiveFullContextAndIndependentReview() throws Exception {
        var json=new ObjectMapper().findAndRegisterModules();var gateway=new MethodReportGateway(json,new StandardEnvironment());
        assertTrue(gateway.enabled());var base=Path.of("../../data/method-quality");var selected=System.getenv("MP_METHOD_CASES");
        assertNotNull(selected);assertTrue(selected.matches("Q[0-9]{2}(,Q[0-9]{2}){0,14}"));
        String group=System.getenv("MP_METHOD_OUTPUT_GROUP");assertTrue(group==null||group.equals("outputs-deepseek"));var outputs=base.resolve(group==null?"outputs":group);Files.createDirectories(outputs);
        int lanes="4".equals(System.getenv("MP_METHOD_CASE_LANES"))?4:"2".equals(System.getenv("MP_METHOD_CASE_LANES"))?2:1;
        assertEquals(selected.split(",").length,new java.util.HashSet<>(java.util.List.of(selected.split(","))).size());
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(lanes)){
            var futures=new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for(String name:selected.split(","))futures.add(pool.submit(()->{runCase(name,json,gateway,base,outputs);return null;}));
            var failures=new java.util.ArrayList<String>();
            for(var future:futures)try{future.get();}catch(java.util.concurrent.ExecutionException e){failures.add(e.getCause().getClass().getSimpleName()+": "+e.getCause().getMessage());}
            assertTrue(failures.isEmpty(),String.join("; ",failures));
        }
    }
    private void runCase(String name,ObjectMapper json,MethodReportGateway gateway,Path base,Path outputs)throws Exception {
            var fixture=json.readTree(Files.readString(base.resolve("cases/"+name+".json")));assertTrue(fixture.path("syntheticOnly").asBoolean());
            var input=fixture.path("input");var evidence=json.createObjectNode().put("case",name).put("syntheticOnly",true).put("provider",gateway.provider()).put("model",gateway.model()).put("promptVersion",MethodReportContract.PROMPT).put("inputSha256",CanonicalJson.hash(json,input)).put("semanticReview","PENDING_HUMAN_OR_AGENT_REVIEW");var calls=evidence.putArray("calls");
            JsonNode draft=null,reviewed=null;String failure=null;boolean resume="true".equals(System.getenv("MP_METHOD_RESUME")),reuse="true".equals(System.getenv("MP_METHOD_REVIEW_RETAINED_DRAFT"));assertFalse(resume&&reuse);
            if(reuse){
                MethodQualityDraftReplay.verifyInitialPipeline(Files.readString(Path.of("src/main/java/com/ruoyi/majorpilot/integration/ai/MethodReportGateway.java")));
                var prior=json.readTree(Files.readString(outputs.resolve(name+".json")));
                draft=MethodQualityDraftReplay.reuse(json,input,prior,evidence);evidence.set("draft",draft.deepCopy());
            }
            if(resume){
                var prior=json.readTree(Files.readString(outputs.resolve(name+".json")));
                assertEquals("FAIL",prior.path("structuralResult").asText());assertEquals("DRAFT_INVALID",prior.path("failure").asText());
                assertEquals(evidence.path("inputSha256"),prior.path("inputSha256"));assertEquals(MethodReportContract.PROMPT,prior.path("promptVersion").asText());assertEquals(gateway.model(),prior.path("model").asText());
                assertEquals(2,prior.path("calls").size());assertEquals("INITIAL",prior.at("/calls/0/stage").asText());assertEquals("REPAIR",prior.at("/calls/1/stage").asText());
                for(var call:prior.path("calls")){assertTrue(call.path("error").isNull());calls.add(call.deepCopy());}
                assertTrue(prior.path("reviewed").isNull());draft=prior.path("draft");assertTrue(MethodReportContract.validate(input,draft).isEmpty(),"Only an already valid saved draft can use its remaining review request");
                evidence.set("draft",draft.deepCopy());evidence.put("resumedCompletedDraft",true);
            }
            if(Files.exists(outputs.resolve(name+".json"))){var history=base.resolve("history");Files.createDirectories(history);Files.copy(outputs.resolve(name+".json"),history.resolve(name+"-"+java.util.UUID.randomUUID()+".json"));}
            System.out.println("METHOD_QUALITY_BEGIN "+name);
            for(String stage:resume||reuse?new String[]{"REVIEW"}:new String[]{"INITIAL","REPAIR","REVIEW"}){
                if(stage.equals("REPAIR")&&draft!=null&&MethodReportContract.validate(input,draft).isEmpty())continue;
                System.out.println("METHOD_QUALITY_STAGE_BEGIN "+name+" "+stage);
                var result=gateway.call(input,draft,stage.equals("REVIEW"));var call=calls.addObject().put("stage",stage).put("promptVersion",MethodReportContract.PROMPT).put("error",result.error()).put("durationMs",result.durationMs());call.set("usage",json.valueToTree(java.util.Arrays.asList(result.inputTokens(),result.outputTokens(),result.reasoningTokens())));if(result.body()!=null)call.set("validationErrors",json.valueToTree(MethodReportContract.validate(input,result.body())));
                System.out.println("METHOD_QUALITY_STAGE_END "+name+" "+stage+" durationMs="+result.durationMs()+" error="+result.error());
                // Synthetic materials only; persist completed call evidence before a later long review.
                evidence.put("structuralResult","IN_PROGRESS");
                if(result.body()!=null)evidence.set(stage.equals("REVIEW")?"reviewed":"draft",result.body());
                Files.writeString(outputs.resolve(name+".json"),json.writerWithDefaultPrettyPrinter().writeValueAsString(evidence));
                if(result.error()!=null){failure=result.error();break;}
                if(stage.equals("REVIEW")){reviewed=result.body();break;}draft=result.body();
                if(stage.equals("REPAIR")&&!MethodReportContract.validate(input,draft).isEmpty()){failure="DRAFT_INVALID";break;}
            }
            evidence.put("structuralResult",failure==null&&reviewed!=null&&MethodReportContract.validate(input,reviewed).isEmpty()?"PASS":"FAIL");evidence.put("failure",failure);evidence.set("draft",draft==null?json.nullNode():draft);evidence.set("reviewed",reviewed==null?json.nullNode():reviewed);
            if(reviewed!=null&&MethodReportContract.validate(input,reviewed).isEmpty())evidence.set("publicAnalysis",MethodReportContract.publicAnalysis(json,input,reviewed));
            Files.writeString(outputs.resolve(name+".json"),json.writerWithDefaultPrettyPrinter().writeValueAsString(evidence));
            System.out.println("METHOD_QUALITY_END "+name+" "+evidence.path("structuralResult").asText()+" requests="+calls.size());
            assertEquals("PASS",evidence.path("structuralResult").asText(),name+" failed; inspect synthetic output, no automatic retry");
    }
}
