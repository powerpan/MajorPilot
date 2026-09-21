package com.ruoyi.majorpilot.businessanalytics;
import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.content.TaskContentRepository;
import com.ruoyi.majorpilot.datascience.DsAssets;
import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Checks BA derivation from the exact immutable DS source, not from student cleaning choices. */
public final class BaAssets {
    public static final String SOURCE_SHA256="9f09364c467d56256b66c9a2da25bf051f0c784bad22795418fd541a7f199cf6";
    private static final ObjectMapper JSON=new ObjectMapper();
    private BaAssets(){}
    public static void validate(Map<String,byte[]> assets,byte[] canonicalBytes){try{
        check(assets.keySet().equals(Set.of("weekly-funnel","weekly-funnel-csv","data-dictionary","business-brief","sql-examples","source-provenance-private","golden-private","review-private")));check(TaskContentRepository.hash(canonicalBytes).equals(SOURCE_SHA256));
        JsonNode rows=read(assets,"weekly-funnel"),source=JSON.readTree(canonicalBytes),provenance=read(assets,"source-provenance-private"),golden=read(assets,"golden-private");BaStatistics.validateRows(rows);check(source.path("records").size()==359);
        int index=0;for(int week=1;week<=12;week++)for(String track:BaSemantics.GROUPS.get("course_track"))for(String channel:BaSemantics.GROUPS.get("signup_source")){
            JsonNode row=rows.get(index++);check(row.path("week").asInt()==week&&row.path("course_track").asText().equals(track)&&row.path("signup_source").asText().equals(channel));var totals=new LinkedHashMap<String,Long>();BaStatistics.COUNTS.forEach(k->totals.put(k,0L));
            for(JsonNode item:source.path("records"))if(item.at("/row/cohort_week").asInt()==week&&item.at("/row/course_track").asText().equals(track)&&item.at("/row/signup_source").asText().equals(channel)){
                totals.compute("enrolled_count",(k,n)->n+1);for(String event:List.of("first_lesson","week_one_active","assignment_started","assignment_submitted"))if(item.path("events").path(event).asBoolean())totals.compute(event+"_count",(k,n)->n+1);if(item.at("/row/completed").asBoolean())totals.compute("completed_count",(k,n)->n+1);totals.compute("support_contact_count",(k,n)->n+item.at("/row/support_contacts").asLong());}
            for(String key:BaStatistics.COUNTS)check(row.path(key).asLong()==totals.get(key));}
        check(DsAssets.equivalent(rows,source.path("futureWeeklyFunnel")));
        var csv=new StringBuilder(String.join(",",BaStatistics.ROW_KEYS)).append('\n');for(JsonNode row:rows){var values=new ArrayList<String>();for(String key:BaStatistics.ROW_KEYS)values.add(row.path(key).asText());csv.append(String.join(",",values)).append('\n');}check(csv.toString().equals(new String(assets.get("weekly-funnel-csv"),StandardCharsets.UTF_8)));
        String datasetSha=TaskContentRepository.hash(assets.get("weekly-funnel"));check(provenance.path("schemaVersion").asText().equals("ba-provenance-v1")&&provenance.path("sourceCanonicalSha256").asText().equals(SOURCE_SHA256)&&provenance.path("uniqueLearners").asInt()==359&&provenance.path("aggregateRows").asInt()==72&&provenance.path("datasetSha256").asText().equals(datasetSha));
        check(golden.path("schemaVersion").asText().equals("ba-golden-v1")&&golden.path("datasetSha256").asText().equals(datasetSha)&&golden.path("cases").size()==10);var names=new HashSet<String>();for(JsonNode c:golden.path("cases")){check(names.add(c.path("name").asText()));check(DsAssets.equivalent(c.path("result"),BaStatistics.calculate(c.path("operationKey").asText(),rows,c.path("parameters"),datasetSha)));}
        var dictionary=read(assets,"data-dictionary");var fields=new ArrayList<String>();for(JsonNode field:dictionary.path("fields"))fields.add(field.path("fieldKey").asText());check(dictionary.path("schemaVersion").asText().equals("ba-dictionary-v1")&&fields.equals(BaStatistics.ROW_KEYS));check(DsAssets.equivalent(dictionary.path("groupOrder"),JSON.valueToTree(BaSemantics.GROUPS)));check(DsAssets.equivalent(dictionary.path("stageOrder"),JSON.valueToTree(BaSemantics.STAGES)));
        var transitions=new ArrayList<String>();for(JsonNode t:dictionary.path("transitions"))transitions.add(t.path("transitionKey").asText());check(transitions.equals(BaSemantics.TRANSITIONS));
        var sql=read(assets,"sql-examples");check(sql.path("schemaVersion").asText().equals("ba-sql-examples-v1")&&sql.path("executionNotice").asText().contains("不在浏览器或服务器执行学生SQL")&&sql.path("snippets").size()==3);int op=0;for(JsonNode snippet:sql.path("snippets")){check(BaSemantics.keys(snippet,List.of("operationKey","title","code"))&&snippet.path("operationKey").asText().equals(BaSemantics.OPERATIONS.get(op++))&&!snippet.path("title").asText().isBlank()&&!snippet.path("code").asText().isBlank());}
        check(read(assets,"business-brief").path("schemaVersion").asText().equals("ba-brief-v1"));var review=read(assets,"review-private");check(review.path("status").asText().equals("REVIEW")&&review.path("professionalReview").asText().equals("PENDING")&&review.path("targetUserTiming").asText().equals("PENDING"));
    }catch(Exception failure){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}}
    private static JsonNode read(Map<String,byte[]> assets,String key)throws Exception{return JSON.readTree(Objects.requireNonNull(assets.get(key)));}
    private static void check(boolean valid){if(!valid)throw new IllegalArgumentException("BA asset mismatch");}
}
