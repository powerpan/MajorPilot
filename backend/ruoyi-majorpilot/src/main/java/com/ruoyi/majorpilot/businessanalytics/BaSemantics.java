package com.ruoyi.majorpilot.businessanalytics;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.math.BigDecimal;
import java.util.*;

/** Pure shared semantics for execution and completion. Never accepts client baselines. */
public final class BaSemantics {
    static final ObjectMapper JSON=new ObjectMapper();
    public static final List<String> STAGES=List.of("enrolled_count","first_lesson_count","week_one_active_count","assignment_started_count","assignment_submitted_count","completed_count");
    public static final List<String> TRANSITIONS=List.of("ENROLLED_TO_FIRST_LESSON","FIRST_LESSON_TO_WEEK_ONE_ACTIVE","WEEK_ONE_ACTIVE_TO_ASSIGNMENT_STARTED","ASSIGNMENT_STARTED_TO_ASSIGNMENT_SUBMITTED","ASSIGNMENT_SUBMITTED_TO_COMPLETED");
    public static final Map<String,List<String>> GROUPS=Map.of("course_track",List.of("FOUNDATIONS","APPLIED"),"signup_source",List.of("ORGANIC","PARTNER","CAMPAIGN"));
    public static final List<String> WINDOWS=List.of("baselineStartWeek","baselineEndWeek","comparisonStartWeek","comparisonEndWeek");
    public static final List<String> OPERATIONS=List.of("ba-metric","ba-funnel","ba-segments");
    public static final List<String> ACTION_FIELDS=List.of("targetSegmentKey","successMetric","targetChangePercentagePoints","guardrailMetric","guardrailMaximum","reviewAfterDays");
    private static final Map<String,String> SUCCESS=Map.of("COMPLETION_RATE","completed_count","FIRST_LESSON_RATE","first_lesson_count","WEEK_ONE_ACTIVE_RATE","week_one_active_count","ASSIGNMENT_SUBMISSION_RATE","assignment_submitted_count","STARTER_COMPLETION_RATE","completed_count");
    private BaSemantics(){}
    static void require(boolean valid,String code){if(!valid)throw new ApiException(422,code);}
    static boolean keys(JsonNode value,Collection<String> expected){if(value==null||!value.isObject()||value.size()!=expected.size())return false;return expected.stream().allMatch(value::has);}
    static boolean choice(JsonNode value,Collection<String> expected){return value!=null&&value.isTextual()&&expected.contains(value.asText());}
    public static void validate(String operation,JsonNode raw){normalize(operation,raw);}
    public static JsonNode normalize(String operation,JsonNode raw){
        String code="BA_PARAMETERS_INVALID";require(OPERATIONS.contains(operation),code);var fields=new HashSet<>(WINDOWS);
        if(!operation.equals("ba-funnel"))fields.addAll(List.of("numerator","denominator"));if(operation.equals("ba-segments"))fields.addAll(List.of("focusTransitionKey","segmentBy"));require(keys(raw,fields),code);
        for(String key:WINDOWS)require(raw.path(key).isIntegralNumber()&&raw.path(key).canConvertToInt()&&raw.path(key).asInt()>=1&&raw.path(key).asInt()<=12,code);
        int bs=raw.path("baselineStartWeek").asInt(),be=raw.path("baselineEndWeek").asInt(),cs=raw.path("comparisonStartWeek").asInt(),ce=raw.path("comparisonEndWeek").asInt();require(bs<=be&&cs<=ce&&be<cs&&be-bs==ce-cs,code);
        if(!operation.equals("ba-funnel"))require(choice(raw.get("numerator"),List.of("completed_count"))&&choice(raw.get("denominator"),List.of("enrolled_count","first_lesson_count")),code);
        if(operation.equals("ba-segments"))require(choice(raw.get("segmentBy"),GROUPS.keySet())&&choice(raw.get("focusTransitionKey"),TRANSITIONS),code);
        ObjectNode result=JSON.createObjectNode();new TreeSet<>(fields).forEach(k->result.set(k,raw.get(k)));return result;
    }
    public static void validateAction(JsonNode input,JsonNode segmentParameters,String prioritySegmentKey,JsonNode result){
        String code="BA_ACTION_INVALID";JsonNode p;try{p=normalize("ba-segments",segmentParameters);}catch(ApiException failure){throw new ApiException(422,code);}
        require(keys(input,ACTION_FIELDS)&&GROUPS.get(p.path("segmentBy").asText()).contains(prioritySegmentKey),code);
        require(choice(input.get("targetSegmentKey"),List.of(prioritySegmentKey))&&choice(input.get("successMetric"),SUCCESS.keySet()),code);
        var goal=input.path("targetChangePercentagePoints");var guard=input.path("guardrailMaximum");
        require(finite(goal)&&goal.decimalValue().signum()>0&&goal.decimalValue().compareTo(BigDecimal.valueOf(100))<=0&&finite(guard)&&guard.decimalValue().signum()>=0&&choice(input.get("guardrailMetric"),List.of("SUPPORT_CONTACTS_PER_100_ENROLLED"))&&input.path("reviewAfterDays").isIntegralNumber()&&input.path("reviewAfterDays").canConvertToInt()&&(input.path("reviewAfterDays").asInt()==28||input.path("reviewAfterDays").asInt()==42),code);
        require(result!=null&&result.isObject()&&result.path("schemaVersion").asText().equals("ba-result-v1")&&result.path("operationKey").asText().equals("ba-segments"),code);
        for(String k:List.of("numerator","denominator","segmentBy","focusTransitionKey"))require(result.path(k).equals(p.path(k)),code);
        for(String period:List.of("baseline","comparison"))for(String edge:List.of("Start","End"))require(result.path("windows").path(period).path(edge.toLowerCase()+"Week").equals(p.path(period+edge+"Week")),code);
        var groups=GROUPS.get(p.path("segmentBy").asText());var segments=result.path("segments");require(segments.isArray()&&segments.size()==groups.size(),code);JsonNode selected=null;
        for(int i=0;i<groups.size();i++){require(segments.get(i).path("segmentKey").asText().equals(groups.get(i)),code);if(groups.get(i).equals(prioritySegmentKey))selected=segments.get(i).path("comparison");}
        require(selected!=null&&selected.isObject()&&keys(selected.path("stageCounts"),STAGES),code);JsonNode counts=selected.path("stageCounts");
        try{BaStatistics.validateCounts(counts,selected.path("supportContactCount"));}catch(ApiException invalid){throw new ApiException(422,code);}
        boolean starter=input.path("successMetric").asText().equals("STARTER_COMPLETION_RATE");require(!starter||p.path("denominator").asText().equals("first_lesson_count"),code);
        long n=counts.path(SUCCESS.get(input.path("successMetric").asText())).asLong(),d=counts.path(starter?"first_lesson_count":"enrolled_count").asLong();require(d>0&&counts.path("enrolled_count").asLong()>0,code);
        BigDecimal left=BigDecimal.valueOf(n).multiply(BigDecimal.valueOf(100)).add(goal.decimalValue().multiply(BigDecimal.valueOf(d)));require(left.compareTo(BigDecimal.valueOf(d).multiply(BigDecimal.valueOf(100)))<=0,code);
    }
    private static boolean finite(JsonNode value){return value.isNumber()&&Double.isFinite(value.asDouble());}
}
