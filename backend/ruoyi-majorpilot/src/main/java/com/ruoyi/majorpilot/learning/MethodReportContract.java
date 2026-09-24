package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.*;

/** Structural/source checks, not a claim to prove the model's semantic judgement. */
public final class MethodReportContract {
    public static final String SCHEMA="method-report-v1",PROMPT="method-report-prompt-v9";
    private static final Set<String> ASSESSMENTS=Set.of("SUPPORTED","PARTIAL","NEEDS_REVISION","INSUFFICIENT");
    private MethodReportContract() {}
    public static List<String> validate(JsonNode input,JsonNode draft) {
        var errors=new ArrayList<String>();
        try {
            exact(draft,"summary","summaryRefs","highlights","nodes","answers","preference","preferenceRefs","comparison");
            var sources=new LinkedHashMap<String,JsonNode>();for(var s:input.path("sources"))if(sources.put(s.path("ref").asText(),s)!=null)throw invalid();
            text(draft,"summary",1200);refs(draft.path("summaryRefs"),sources,null,1);
            array(draft.path("highlights"),0,3);
            for(var h:draft.path("highlights")){exact(h,"title","explanation","sourceRefs");text(h,"title",80);text(h,"explanation",600);refs(h.path("sourceRefs"),sources,null,1);}
            var required=new LinkedHashSet<String>();for(var s:sources.values())if(s.path("requiredFinding").asBoolean())required.add(s.path("ref").asText());
            array(draft.path("answers"),required.size(),required.size());
            for(var a:draft.path("answers")){exact(a,"sourceRef","assessment","explanation","nextStep");if(!required.remove(a.path("sourceRef").asText()))throw invalid();assessment(a);text(a,"explanation",1200);if(a.path("assessment").asText().equals("SUPPORTED"))optionalText(a,"nextStep",800);else text(a,"nextStep",800);}
            if(!required.isEmpty())throw invalid();
            var checkpoints=new LinkedHashMap<String,JsonNode>();for(var c:input.path("checkpoints"))checkpoints.put(c.path("checkpointId").asText(),c);
            array(draft.path("nodes"),checkpoints.size(),checkpoints.size());
            for(var node:draft.path("nodes")){
                exact(node,"checkpointId","assessment","reasoning","nextStep","example","quotes","change","dependency");
                String cp=node.path("checkpointId").asText();var c=checkpoints.remove(cp);if(c==null)throw invalid();String major=c.path("majorCode").asText();
                assessment(node);text(node,"reasoning",1600);text(node,"nextStep",800);optionalText(node,"example",1000);
                array(node.path("quotes"),1,6);
                boolean hasOwn=false;
                for(var q:node.path("quotes")){exact(q,"sourceRef","quote");var source=sources.get(q.path("sourceRef").asText());text(q,"quote",1600);if(source==null||!source.path("majorCode").asText().equals(major)||!source.path("studentText").asBoolean()||!source.path("value").asText().contains(q.path("quote").asText()))throw invalid();if(source.path("checkpointId").asText().equals(cp))hasOwn=true;}
                if(!hasOwn)throw invalid();
                var change=node.path("change");exact(change,"state","explanation","sourceRefs");text(change,"explanation",1000);refs(change.path("sourceRefs"),sources,major,1);
                String state=change.path("state").asText();if(!Set.of("NO_COMPARISON","COMPARED").contains(state))throw invalid();
                if(state.equals("COMPARED")){var roles=new HashSet<String>();for(var ref:change.path("sourceRefs")){var s=sources.get(ref.asText());if(s.path("checkpointId").asText().equals(cp)&&s.path("kind").asText().equals("ATTEMPT")&&Set.of("INITIAL","REVISION","TRANSFER").contains(s.path("role").asText()))roles.add(s.path("role").asText());}if(roles.size()<2)throw new ValidationFailure("CHANGE_REQUIRES_TWO_ATTEMPT_STAGES:"+cp+":FINAL_IS_NOT_A_STAGE");}
                var dep=node.path("dependency");exact(dep,"explanation","sourceRefs");text(dep,"explanation",1000);refs(dep.path("sourceRefs"),sources,major,1);
            }
            text(draft,"preference",1600);refs(draft.path("preferenceRefs"),sources,null,1);for(var r:draft.path("preferenceRefs"))if(!sources.get(r.asText()).path("kind").asText().equals("REFLECTION"))throw invalid();
            var majors=new HashSet<String>();for(var s:input.path("runs"))majors.add(s.path("majorCode").asText());
            array(draft.path("comparison"),majors.size()>1?1:0,majors.size()>1?3:0);
            for(var c:draft.path("comparison")){exact(c,"text","sourceRefs");text(c,"text",1200);refs(c.path("sourceRefs"),sources,null,2);var covered=new HashSet<String>();for(var r:c.path("sourceRefs"))covered.add(sources.get(r.asText()).path("majorCode").asText());if(covered.size()<2)throw new ValidationFailure("COMPARISON_REQUIRES_TWO_MAJORS:each_comparison_item_must_compare_at_least_two_majors_and_cite_both_not_list_one_major_per_item");}
            if(!safe(draft,null))throw invalid();
        } catch(ValidationFailure e){errors.add(e.getMessage());}
        catch(RuntimeException e){errors.add("METHOD_REPORT_STRUCTURE_OR_SOURCE_INVALID");}
        return List.copyOf(errors);
    }
    public static ObjectNode publicAnalysis(ObjectMapper mapper,JsonNode input,JsonNode draft){
        if(!validate(input,draft).isEmpty())throw invalid();var out=(ObjectNode)draft.deepCopy();
        var sources=new HashMap<String,JsonNode>();input.path("sources").forEach(s->sources.put(s.path("ref").asText(),s));
        var checkpoints=new HashMap<String,JsonNode>();input.path("checkpoints").forEach(c->checkpoints.put(c.path("checkpointId").asText(),c));
        out.remove(List.of("summaryRefs","preferenceRefs"));for(var h:out.path("highlights"))((ObjectNode)h).remove("sourceRefs");
        for(var n:out.path("nodes")){var c=checkpoints.get(n.path("checkpointId").asText());((ObjectNode)n).put("title",c.path("title").asText()).put("majorCode",c.path("majorCode").asText());
            ((ObjectNode)n).set("supportConditions",c.path("supportConditions").deepCopy());
            for(var q:n.path("quotes")){var s=sources.get(q.path("sourceRef").asText());((ObjectNode)q).put("label",s.path("label").asText());((ObjectNode)q).remove("sourceRef");}
            ((ObjectNode)n.path("change")).remove("sourceRefs");((ObjectNode)n.path("dependency")).remove("sourceRefs");}
        for(var a:out.path("answers")){var s=sources.get(a.path("sourceRef").asText());((ObjectNode)a).put("label",s.path("label").asText()).put("answerQuote",s.path("value").asText()).put("majorCode",s.path("majorCode").asText());((ObjectNode)a).remove("sourceRef");}
        for(var c:out.path("comparison"))((ObjectNode)c).remove("sourceRefs");return out;
    }
    private static boolean safe(JsonNode value,String key){if(value.isTextual()){if(Set.of("quote").contains(key==null?"":key))return true;return !value.asText().matches("(?is).*(https?://|<script|你不适合|你(?:最|更)?适合(?:读|学|选择)|你的智商|你的人格|适配度[：:为是 ]*\\d|综合得分|学习速度排名).*" );}for(var e=value.fields();e.hasNext();){var field=e.next();if(!safe(field.getValue(),field.getKey()))return false;}if(value.isArray())for(var child:value)if(!safe(child,key))return false;return true;}
    private static void assessment(JsonNode n){if(!ASSESSMENTS.contains(n.path("assessment").asText()))throw invalid();}
    private static void refs(JsonNode refs,Map<String,JsonNode> sources,String major,int min){array(refs,min,60);var used=new HashSet<String>();for(var r:refs){var s=sources.get(r.asText());if(!r.isTextual()||s==null||!used.add(r.asText())||major!=null&&!major.equals(s.path("majorCode").asText()))throw invalid();}}
    private static void exact(JsonNode n,String...keys){if(!n.isObject()||n.size()!=keys.length)throw invalid();for(String k:keys)if(!n.has(k))throw invalid();}
    private static void array(JsonNode n,int min,int max){if(!n.isArray()||n.size()<min||n.size()>max)throw invalid();}
    private static void text(JsonNode n,String key,int max){optionalText(n,key,max);if(n.path(key).asText().isBlank())throw invalid();}
    private static void optionalText(JsonNode n,String key,int max){if(!n.path(key).isTextual()||n.path(key).asText().length()>max)throw invalid();}
    private static ApiException invalid(){return new ApiException(422,"METHOD_REPORT_INVALID");}
    private static final class ValidationFailure extends RuntimeException { ValidationFailure(String code){super(code);} }
}
