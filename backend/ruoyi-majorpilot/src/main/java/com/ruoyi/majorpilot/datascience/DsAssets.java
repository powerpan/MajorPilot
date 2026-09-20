package com.ruoyi.majorpilot.datascience;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.content.TaskContentRepository;
import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Checks declared teaching data against canonical event provenance and all goldens. */
public final class DsAssets {
    private static final ObjectMapper JSON=new ObjectMapper();
    private DsAssets(){}
    public static void validate(Map<String,byte[]> assets){try{
        JsonNode rows=read(assets,"learner-activity"),source=read(assets,"canonical-events-private"),golden=read(assets,"golden-private");
        DsStatistics.validateRows(rows);check(rows.size()==360&&source.path("records").size()==359&&source.path("seed").asInt()==271828&&source.path("generatorVersion").asText().equals("learning-synthetic-v1"));
        Map<String,JsonNode> originals=new LinkedHashMap<>();ArrayNode canonical=JSON.createArrayNode();for(JsonNode item:source.path("records")){JsonNode row=item.path("row"),events=item.path("events");check(originals.put(row.path("learner_id").asText(),row)==null);canonical.add(row);
            check(row.path("completed").asBoolean()==(row.path("lessons_completed").asInt()==8&&row.path("assignment_submit_rate").asDouble()==1));check(events.path("first_lesson").asBoolean()==(row.path("lessons_started").asInt()>0));check(events.path("assignment_submitted").asBoolean()==(row.path("assignment_submit_rate").asDouble()>0));
            check(!events.path("week_one_active").asBoolean()||events.path("first_lesson").asBoolean());check(!events.path("assignment_started").asBoolean()||events.path("week_one_active").asBoolean());check(!events.path("assignment_submitted").asBoolean()||events.path("assignment_started").asBoolean());check(!row.path("completed").asBoolean()||events.path("assignment_submitted").asBoolean());}
        DsStatistics.validateRows(canonical);
        Set<String> injected=new HashSet<>();Map<String,Set<String>> missing=new HashMap<>();int[] counts={10,8,6};for(int i=0;i<3;i++){String field=DsSemantics.NUMERIC.get(i);var ids=new HashSet<String>();for(JsonNode id:source.path("injectedMissing").path(field)){check(injected.add(id.asText())&&ids.add(id.asText()));check(originals.containsKey(id.asText())&&originals.get(id.asText()).path("lessons_started").asInt()>0);}check(ids.size()==counts[i]);missing.put(field,ids);}check(injected.size()==24&&!injected.contains(source.path("duplicateLearnerId").asText()));
        Set<String> unique=new HashSet<>();int duplicateCount=0;StringBuilder csv=new StringBuilder(String.join(",",DsStatistics.ROW_KEYS)).append('\n');
        for(JsonNode row:rows){String id=row.path("learner_id").asText();check(originals.containsKey(id));unique.add(id);if(id.equals(source.path("duplicateLearnerId").asText()))duplicateCount++;var parts=new ArrayList<String>();for(String field:DsStatistics.ROW_KEYS){JsonNode actual=row.get(field),expected=missing.getOrDefault(field,Set.of()).contains(id)?NullNode.instance:originals.get(id).get(field);check(equivalent(actual,expected));parts.add(actual.isNull()?"":actual.isBoolean()?(actual.asBoolean()?"1":"0"):actual.asText());}csv.append(String.join(",",parts)).append('\n');}
        check(unique.size()==359&&duplicateCount==2&&csv.toString().equals(new String(assets.get("learner-activity-csv"),StandardCharsets.UTF_8)));
        check(source.path("futureWeeklyFunnel").size()==72);for(int week=1;week<=12;week++){final int w=week;check(originals.values().stream().filter(r->r.path("cohort_week").asInt()==w).count()==(week==12?29:30));for(String track:DsSemantics.GROUPS.get("course_track"))for(String signup:DsSemantics.GROUPS.get("signup_source")){
            var entries=new ArrayList<JsonNode>();for(var item:source.path("records"))if(item.at("/row/cohort_week").asInt()==week&&item.at("/row/course_track").asText().equals(track)&&item.at("/row/signup_source").asText().equals(signup))entries.add(item);
            var matches=new ArrayList<JsonNode>();for(var item:source.path("futureWeeklyFunnel"))if(item.path("week").asInt()==week&&item.path("course_track").asText().equals(track)&&item.path("signup_source").asText().equals(signup))matches.add(item);check(matches.size()==1);JsonNode aggregate=matches.getFirst();check(aggregate.path("enrolled_count").asInt()==entries.size());
            for(String event:List.of("first_lesson","week_one_active","assignment_started","assignment_submitted"))check(aggregate.path(event+"_count").asLong()==entries.stream().filter(e->e.path("events").path(event).asBoolean()).count());check(aggregate.path("completed_count").asLong()==entries.stream().filter(e->e.at("/row/completed").asBoolean()).count());check(aggregate.path("support_contact_count").asLong()==entries.stream().mapToInt(e->e.at("/row/support_contacts").asInt()).sum());
        }}
        String datasetSha=TaskContentRepository.hash(assets.get("learner-activity"));check(golden.path("datasetSha256").asText().equals(datasetSha)&&golden.path("cases").size()==10);for(var c:golden.path("cases"))check(equivalent(c.path("result"),DsStatistics.calculate(c.path("operationKey").asText(),rows,c.path("parameters"),datasetSha)));
        var fields=new ArrayList<String>();for(var f:read(assets,"data-dictionary").path("fields"))fields.add(f.path("fieldKey").asText());check(fields.equals(DsStatistics.ROW_KEYS));
        JsonNode python=read(assets,"python-examples");check(python.path("schemaVersion").asText().equals("ds-python-examples-v1")&&python.path("executionNotice").asText().contains("不在浏览器执行Python")&&python.path("executionNotice").asText().contains("不是完整执行器"));
        var snippetKeys=new TreeSet<String>();for(var snippet:python.path("snippets")){var keys=new HashSet<String>();snippet.fieldNames().forEachRemaining(keys::add);var expected=new HashSet<>(List.of("operationKey","title","code"));if(snippet.has("relationshipMode"))expected.add("relationshipMode");check(keys.equals(expected)&&snippet.path("title").isTextual()&&!snippet.path("title").asText().isBlank()&&snippet.path("code").isTextual()&&!snippet.path("code").asText().isBlank());check(snippetKeys.add(snippet.path("operationKey").asText()+":"+snippet.path("relationshipMode").asText("")));}
        check(snippetKeys.equals(new TreeSet<>(List.of("ds-quality-clean:","ds-profile:","ds-relationship:GROUP_COMPLETION","ds-relationship:SCATTER","ds-stratify:GROUP_COMPLETION","ds-stratify:SCATTER"))));
        check(read(assets,"review-private").path("professionalReview").asText().equals("PENDING")&&read(assets,"review-private").path("targetUserTiming").asText().equals("PENDING"));
    }catch(Exception failure){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}}
    private static JsonNode read(Map<String,byte[]> assets,String key)throws Exception{return JSON.readTree(Objects.requireNonNull(assets.get(key)));}
    private static void check(boolean valid){if(!valid)throw new IllegalArgumentException("DS asset mismatch");}
    public static boolean equivalent(JsonNode a,JsonNode b){if(a==null||b==null)return a==b;if(a.isNumber()&&b.isNumber())return a.decimalValue().compareTo(b.decimalValue())==0;if(a.isObject()&&b.isObject()){if(a.size()!=b.size())return false;var fields=a.fieldNames();while(fields.hasNext()){String f=fields.next();if(!equivalent(a.get(f),b.get(f)))return false;}return true;}if(a.isArray()&&b.isArray()){if(a.size()!=b.size())return false;for(int i=0;i<a.size();i++)if(!equivalent(a.get(i),b.get(i)))return false;return true;}return a.equals(b);}
}
