package com.ruoyi.majorpilot.datascience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.*;

/** The same bounded parameter semantics must guard execution and completion. */
public final class DsSemantics {
    public static final List<String> NUMERIC=List.of("avg_session_minutes","days_to_first_lesson","assignment_submit_rate");
    public static final List<String> CLEAN=List.of("duplicatePolicy","missingPolicy","extremePolicy");
    public static final List<String> RELATION=List.of("relationshipMode","groupBy","xField","yField");
    public static final Map<String,List<String>> GROUPS=Map.of("course_track",List.of("FOUNDATIONS","APPLIED"),"signup_source",List.of("ORGANIC","PARTNER","CAMPAIGN"),"device_group",List.of("desktop","mobile","mixed"),"cohort_period",List.of("EARLY","LATE"),"days_to_first_lesson_band",List.of("SAME_DAY","DAYS_1_2","DAYS_3_6","DAYS_7_PLUS"));
    private static final ObjectMapper JSON=new ObjectMapper();
    private DsSemantics(){}
    public static void validate(String operation,JsonNode raw){normalize(operation,raw);}
    public static JsonNode normalize(String operation,JsonNode raw){
        require(raw!=null&&raw.isObject());require(Set.of("ds-quality-clean","ds-profile","ds-relationship","ds-stratify").contains(operation));
        Set<String> keys=new HashSet<>(CLEAN);if(operation.equals("ds-profile"))keys.add("distributionField");if(Set.of("ds-relationship","ds-stratify").contains(operation))keys.addAll(RELATION);if(operation.equals("ds-stratify"))keys.add("stratifyBy");
        raw.fieldNames().forEachRemaining(k->require(keys.contains(k)));
        choice(raw,"duplicatePolicy",List.of("KEEP","DROP_EXACT"));choice(raw,"missingPolicy",List.of("KEEP_NULL","DROP_MISSING","MEDIAN_NUMERIC"));choice(raw,"extremePolicy",List.of("KEEP","CAP_P95"));
        if(operation.equals("ds-profile"))choice(raw,"distributionField",NUMERIC);
        if(Set.of("ds-relationship","ds-stratify").contains(operation)){
            choice(raw,"relationshipMode",List.of("GROUP_COMPLETION","SCATTER"));
            if(raw.path("relationshipMode").asText().equals("GROUP_COMPLETION")){choice(raw,"groupBy",GROUPS.keySet());require(!raw.has("xField")&&!raw.has("yField"));}
            else{choice(raw,"xField",NUMERIC);choice(raw,"yField",NUMERIC);require(!raw.path("xField").equals(raw.path("yField"))&&!raw.has("groupBy"));}
            if(operation.equals("ds-stratify")){choice(raw,"stratifyBy",List.of("course_track","cohort_period"));require(!raw.path("stratifyBy").equals(raw.path("groupBy")));}
        }
        var sorted=new TreeMap<String,JsonNode>();raw.fields().forEachRemaining(e->sorted.put(e.getKey(),e.getValue()));ObjectNode result=JSON.createObjectNode();sorted.forEach(result::set);return result;
    }
    private static void choice(JsonNode raw,String key,Collection<String> values){require(raw.path(key).isTextual()&&values.contains(raw.path(key).asText()));}
    static void require(boolean value){if(!value)throw new ApiException(422,"DS_PARAMETERS_INVALID");}
}
