package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.*;
import java.util.regex.Pattern;

public final class TaskManifestValidator {
    private static final Pattern KEY=Pattern.compile("[a-z][a-z0-9-]{0,79}");
    public static final Set<String> PROFESSIONAL_CHECKS=Set.of("PROFESSIONAL_CORE","BEGINNER_ACCESS","DATA_CORRECTNESS","EVIDENCE_SOURCES","HINT_NO_FINAL_ANSWER","FAIRNESS","CHROME_EDGE","TIMING_45_60","RECOVERY","VERSION_CONSISTENCY");
    private TaskManifestValidator() {}
    public static void validate(JsonNode m) {
        fields(m,"schemaVersion taskVersionId contentKind majorCode demoKey versionCode title scenario goals estimatedMinutes assets steps operations reflection review");
        check(m.path("schemaVersion").asText().equals("task-manifest-v1"));check(m.path("taskVersionId").asText().matches("[0-7][0-9A-HJKMNP-TV-Z]{25}"));check(m.path("versionCode").asText().matches("[0-9]+\\.[0-9]+\\.[0-9]+"));
        text(m,"title",100);text(m,"scenario",1000);array(m,"goals",1,6);for(JsonNode goal:m.path("goals"))check(goal.isTextual()&&!goal.asText().isBlank()&&goal.asText().length()<=200);
        fields(m.path("estimatedMinutes"),"minimum maximum");integer(m.path("estimatedMinutes"),"minimum",1,90);integer(m.path("estimatedMinutes"),"maximum",1,90);check(m.at("/estimatedMinutes/minimum").asInt()<=m.at("/estimatedMinutes/maximum").asInt());
        String kind=m.path("contentKind").asText();check(Set.of("DEMO","MAJOR").contains(kind));
        if(kind.equals("DEMO")){check(m.path("majorCode").isNull());check(Set.of("DEMO_TABLE","DEMO_COMPARE").contains(m.path("demoKey").asText()));}
        else{check(Set.of("AI","DATA_SCIENCE","BUSINESS_ANALYTICS").contains(m.path("majorCode").asText()));check(m.path("demoKey").isNull());check(m.at("/estimatedMinutes/minimum").asInt()==45&&m.at("/estimatedMinutes/maximum").asInt()==60);}
        array(m,"assets",0,30);Map<String,JsonNode> assets=new HashMap<>();for(JsonNode a:m.path("assets")){
            fields(a,"assetKey path visibility mediaType sha256 byteLength");key(a,"assetKey");check(assets.put(a.path("assetKey").asText(),a)==null);safePath(a.path("path").asText());check(Set.of("PUBLIC","PRIVATE").contains(a.path("visibility").asText()));check(Set.of("application/json","text/csv","text/plain").contains(a.path("mediaType").asText()));check(a.path("sha256").asText().matches("[a-f0-9]{64}"));integer(a,"byteLength",1,1048576);
        }
        array(m,"steps",1,30);Set<String> seen=new HashSet<>();Map<String,JsonNode> steps=new HashMap<>();for(JsonNode s:m.path("steps")){
            fields(s,"stepKey title instructions dependencies required responseSchemaVersion inputSchema assetKeys operationKey hints hintContextFields evidenceFields");key(s,"stepKey");String sk=s.path("stepKey").asText();check(steps.put(sk,s)==null);text(s,"title",100);text(s,"instructions",1000);text(s,"responseSchemaVersion",80);check(s.path("required").isBoolean());array(s,"dependencies",0,30);
            for(JsonNode d:s.path("dependencies"))check(d.isTextual()&&seen.contains(d.asText()));seen.add(sk);TaskInputValidator.validateSchema(s.path("inputSchema"));check(s.at("/inputSchema/type").asText().equals("object"));
            assetRefs(s,"assetKeys",assets,"PUBLIC");array(s,"hints",3,3);Set<Integer> levels=new HashSet<>();for(JsonNode hint:s.path("hints")){fields(hint,"level text");integer(hint,"level",1,3);check(levels.add(hint.path("level").asInt()));text(hint,"text",600);}
            for(String name:List.of("hintContextFields","evidenceFields")){array(s,name,0,30);for(JsonNode field:s.path(name))check(field.isTextual()&&s.at("/inputSchema/properties").has(field.asText()));}
            if(!s.path("operationKey").isNull())key(s,"operationKey");
        }
        array(m,"operations",0,30);Set<String> operations=new HashSet<>();for(JsonNode o:m.path("operations")){
            fields(o,"operationKey stepKey engineType engineVersion parametersSchema resultSchema maxEvaluations publicAssetKeys privateAssetKeys datasetAssetKey");key(o,"operationKey");key(o,"stepKey");check(operations.add(o.path("operationKey").asText()));JsonNode step=steps.get(o.path("stepKey").asText());check(step!=null&&step.path("operationKey").equals(o.path("operationKey")));check(Set.of("DEMO_SUMMARY","FROZEN_CLASSIFIER","SQL_TEMPLATE","RULES").contains(o.path("engineType").asText()));text(o,"engineVersion",80);TaskInputValidator.validateSchema(o.path("parametersSchema"));TaskInputValidator.validateSchema(o.path("resultSchema"));integer(o,"maxEvaluations",1,30);assetRefs(o,"publicAssetKeys",assets,"PUBLIC");assetRefs(o,"privateAssetKeys",assets,"PRIVATE");check(assets.containsKey(o.path("datasetAssetKey").asText()));
            if(kind.equals("DEMO"))check(o.path("engineType").asText().equals("DEMO_SUMMARY"));
        }
        for(JsonNode step:steps.values())if(!step.path("operationKey").isNull())check(operations.contains(step.path("operationKey").asText()));
        fields(m.path("reflection"),"questionSetVersion instructions inputSchema");text(m.path("reflection"),"questionSetVersion",80);text(m.path("reflection"),"instructions",1000);TaskInputValidator.validateSchema(m.at("/reflection/inputSchema"));
        JsonNode review=m.path("review");fields(review,"kind checkKeys professionalReviewRequired");check(review.path("professionalReviewRequired").isBoolean());check(review.path("professionalReviewRequired").asBoolean()==kind.equals("MAJOR"));check(review.path("kind").asText().equals(kind.equals("DEMO")?"TECHNICAL_DEMO":"PROFESSIONAL"));array(review,"checkKeys",1,30);Set<String> checks=new HashSet<>();for(JsonNode c:review.path("checkKeys"))check(c.isTextual()&&checks.add(c.asText()));if(kind.equals("MAJOR"))check(checks.containsAll(PROFESSIONAL_CHECKS));
        scan(m);
    }
    private static void scan(JsonNode value){if(value.isTextual()){String text=value.asText();check(!text.matches("(?is).*(https?://|file:|javascript:|<script|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}).*"));}else for(JsonNode child:value)scan(child);}
    public static void safePath(String path){check(path.matches("[a-z0-9][a-z0-9./-]{0,200}")&&!path.contains("..")&&!path.contains("//")&&!path.endsWith("/"));}
    private static void assetRefs(JsonNode parent,String name,Map<String,JsonNode> assets,String visibility){array(parent,name,0,30);Set<String> seen=new HashSet<>();for(JsonNode ref:parent.path(name)){JsonNode a=assets.get(ref.asText());check(ref.isTextual()&&seen.add(ref.asText())&&a!=null&&a.path("visibility").asText().equals(visibility));}}
    private static void fields(JsonNode node,String keys){check(node.isObject());Set<String> allowed=Set.of(keys.split(" "));check(node.size()==allowed.size());for(String key:allowed)check(node.has(key));for(var f=node.fieldNames();f.hasNext();)check(allowed.contains(f.next()));}
    private static void text(JsonNode node,String key,int max){check(node.path(key).isTextual()&&!node.path(key).asText().isBlank()&&node.path(key).asText().length()<=max);}
    private static void key(JsonNode node,String key){check(node.path(key).isTextual()&&KEY.matcher(node.path(key).asText()).matches());}
    private static void integer(JsonNode node,String key,int min,int max){check(node.path(key).isIntegralNumber()&&node.path(key).asLong()>=min&&node.path(key).asLong()<=max);}
    private static void array(JsonNode node,String key,int min,int max){check(node.path(key).isArray()&&node.path(key).size()>=min&&node.path(key).size()<=max);}
    private static void check(boolean valid){if(!valid)throw new ApiException(422,"CONTENT_SCHEMA_INVALID");}
}
