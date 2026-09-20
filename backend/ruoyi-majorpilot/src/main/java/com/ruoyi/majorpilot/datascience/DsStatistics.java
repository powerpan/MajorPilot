package com.ruoyi.majorpilot.datascience;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.content.TaskContentRepository;
import java.math.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static com.ruoyi.majorpilot.datascience.DsSemantics.*;

/** ds-stats-v1: finite, versioned teaching statistics, with no code execution. */
public final class DsStatistics {
    private static final ObjectMapper JSON=new ObjectMapper();
    public static final List<String> ROW_KEYS=List.of("learner_id","cohort_week","course_track","signup_source","device_group","lessons_started","lessons_completed","assignment_submit_rate","avg_session_minutes","days_to_first_lesson","forum_visits","support_contacts","completed");
    public static final Map<String,List<Double>> BINS=Map.of("avg_session_minutes",List.of(0.,10.,20.,40.,80.,240.),"days_to_first_lesson",List.of(0.,1.,3.,7.,14.,28.),"assignment_submit_rate",List.of(0.,.25,.5,.75,1.));
    private DsStatistics(){}
    static Map<String,Object> map(Object... pairs){var result=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)result.put((String)pairs[i],pairs[i+1]);return result;}
    public static double halfUp6(double value){require(Double.isFinite(value));return BigDecimal.valueOf(value).setScale(6,RoundingMode.HALF_UP).doubleValue();}
    public static Double quantile(List<Double> values,double p){if(values.isEmpty())return null;var sorted=new ArrayList<>(values);Collections.sort(sorted);double h=(sorted.size()-1)*p;int lo=(int)Math.floor(h);return sorted.get(lo)+(h-lo)*(sorted.get(Math.min(lo+1,sorted.size()-1))-sorted.get(lo));}
    public static Map<String,Object> wilson(int successes,int n){if(n==0)return map("lower",null,"upper",null);double z=1.959963984540054,z2=z*z,p=(double)successes/n,d=1+z2/n,center=(p+z2/(2*n))/d,half=z*Math.sqrt((p*(1-p)+z2/(4*n))/n)/d;return map("lower",Math.max(0,center-half),"upper",Math.min(1,center+half));}
    public static Map<String,Object> pearson(List<double[]> points){
        int n=points.size();if(n==0)return map("n",0,"meanX",null,"meanY",null,"r",null);
        double sx=0,sy=0;for(var p:points){sx+=p[0];sy+=p[1];}double mx=sx/n,my=sy/n,xx=0,yy=0,xy=0;
        for(var p:points){double dx=p[0]-mx,dy=p[1]-my;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
        return map("n",n,"meanX",mx,"meanY",my,"r",n<2||xx==0||yy==0?null:Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))));
    }
    public static void validateRows(JsonNode rows){
        require(rows!=null&&rows.isArray()&&rows.size()<=360);
        for(var r:rows){require(r.isObject()&&r.size()==ROW_KEYS.size());for(String key:ROW_KEYS)require(r.has(key));require(r.path("learner_id").isTextual()&&r.path("learner_id").asText().matches("learner-[0-9]{3}"));integer(r,"cohort_week",1,12);
            for(String key:List.of("course_track","signup_source","device_group"))require(r.path(key).isTextual()&&GROUPS.get(key).contains(r.path(key).asText()));
            integer(r,"lessons_started",0,8);integer(r,"lessons_completed",0,8);integer(r,"forum_visits",0,60);integer(r,"support_contacts",0,20);require(r.path("lessons_completed").asInt()<=r.path("lessons_started").asInt()&&r.path("completed").isBoolean());
            for(String f:NUMERIC)require(r.path(f).isNull()||r.path(f).isNumber()&&Double.isFinite(r.path(f).asDouble())&&r.path(f).asDouble()>=0&&r.path(f).asDouble()<=BINS.get(f).getLast());
            if(r.path("lessons_started").asInt()==0)require(r.path("avg_session_minutes").isNull()&&r.path("days_to_first_lesson").isNull()&&(r.path("assignment_submit_rate").isNull()||r.path("assignment_submit_rate").asDouble()==0)&&!r.path("completed").asBoolean());
            if(r.path("completed").asBoolean())require(r.path("lessons_completed").asInt()==8&&(r.path("assignment_submit_rate").isNull()||r.path("assignment_submit_rate").asDouble()==1));
        }
    }
    private static void integer(JsonNode r,String key,int min,int max){require(r.path(key).isIntegralNumber()&&r.path(key).asLong()>=min&&r.path(key).asLong()<=max);}
    private static String status(JsonNode row,String field){return !row.path(field).isNull()?"VALID":!field.equals("assignment_submit_rate")&&row.path("lessons_started").asInt()==0?"NOT_APPLICABLE":"MISSING";}
    private static List<Map<String,Object>> fieldQuality(List<ObjectNode> rows){var result=new ArrayList<Map<String,Object>>();for(String f:NUMERIC){int valid=0,missing=0,na=0;for(var r:rows)switch(status(r,f)){case "VALID"->valid++;case "MISSING"->missing++;default->na++;}result.add(map("fieldKey",f,"validCount",valid,"missingCount",missing,"notApplicableCount",na));}return result;}
    private static Map<String,Object> exclusions(){return map("missingOnly",0,"notApplicableOnly",0,"both",0,"total",0);}
    private record Selected(List<ObjectNode> rows,Map<String,Object> exclusions){}
    private static Selected select(List<ObjectNode> rows,List<String> fields){var result=new ArrayList<ObjectNode>();var excluded=exclusions();for(var row:rows){boolean missing=false,na=false;for(String f:fields){missing|=status(row,f).equals("MISSING");na|=status(row,f).equals("NOT_APPLICABLE");}if(missing||na){String key=missing&&na?"both":missing?"missingOnly":"notApplicableOnly";excluded.put(key,(int)excluded.get(key)+1);excluded.put("total",(int)excluded.get("total")+1);}else result.add(row);}return new Selected(result,excluded);}
    private record Cleaned(List<ObjectNode> rows,Map<String,Object> quality){}
    private static Cleaned clean(JsonNode input,JsonNode config){
        var seen=new LinkedHashMap<String,Integer>();var duplicates=new LinkedHashMap<String,Map<String,Object>>();var rows=new ArrayList<ObjectNode>();var rawRows=new ArrayList<ObjectNode>();
        for(int i=0;i<input.size();i++){ObjectNode row=input.get(i).deepCopy();rawRows.add(row);ArrayNode canonical=JSON.createArrayNode();for(String k:ROW_KEYS)canonical.add(row.get(k));String key=canonical.toString();int number=i+1;
            if(seen.containsKey(key)){if(!duplicates.containsKey(key))duplicates.put(key,map("learnerId",row.path("learner_id").asText(),"rowNumbers",new ArrayList<>(List.of(seen.get(key)))));@SuppressWarnings("unchecked") var numbers=(List<Integer>)duplicates.get(key).get("rowNumbers");numbers.add(number);if(config.path("duplicatePolicy").asText().equals("DROP_EXACT"))continue;}else seen.put(key,number);
            ObjectNode copied=row.deepCopy();copied.put("rowNumber",number);rows.add(copied);
        }
        int removedDuplicateRows=input.size()-rows.size();var medians=new LinkedHashMap<String,Double>();var imputations=new ArrayList<Map<String,Object>>();for(String f:NUMERIC){Double median=quantile(values(rows,f),.5);medians.put(f,median);imputations.add(map("fieldKey",f,"count",0,"median",median));}
        int removedMissingRows=0;if(config.path("missingPolicy").asText().equals("DROP_MISSING")){int old=rows.size();rows.removeIf(r->NUMERIC.stream().anyMatch(f->status(r,f).equals("MISSING")));removedMissingRows=old-rows.size();}
        if(config.path("missingPolicy").asText().equals("MEDIAN_NUMERIC"))for(var row:rows)for(var info:imputations){String f=(String)info.get("fieldKey");if(status(row,f).equals("MISSING")&&medians.get(f)!=null){row.put(f,medians.get(f));info.put("count",(int)info.get("count")+1);}}
        Double cap=null;int capped=0;if(config.path("extremePolicy").asText().equals("CAP_P95")){cap=quantile(values(rows,"avg_session_minutes"),.95);if(cap!=null)for(var row:rows)if(!row.path("avg_session_minutes").isNull()&&row.path("avg_session_minutes").asDouble()>cap){row.put("avg_session_minutes",cap);capped++;}}
        return new Cleaned(rows,map("duplicateRows",input.size()-seen.size(),"duplicateGroups",new ArrayList<>(duplicates.values()),"removedDuplicateRows",removedDuplicateRows,"removedMissingRows",removedMissingRows,"before",fieldQuality(rawRows),"after",fieldQuality(rows),"imputations",imputations,"cappedRows",capped,"capValue",cap));
    }
    private static List<Double> values(List<ObjectNode> rows,String field){return rows.stream().filter(r->status(r,field).equals("VALID")).map(r->r.path(field).asDouble()).toList();}
    private static Map<String,Object> completion(List<ObjectNode> rows){int n=rows.size(),k=(int)rows.stream().filter(r->r.path("completed").asBoolean()).count();var ci=wilson(k,n);return map("n",n,"completedCount",k,"completionRate",n==0?null:(double)k/n,"ciLower",ci.get("lower"),"ciUpper",ci.get("upper"));}
    private static String groupKey(JsonNode row,String field){if(field.equals("cohort_period"))return row.path("cohort_week").asInt()<=6?"EARLY":"LATE";if(field.equals("days_to_first_lesson_band")){double d=row.path("days_to_first_lesson").asDouble();return d<1?"SAME_DAY":d<3?"DAYS_1_2":d<7?"DAYS_3_6":"DAYS_7_PLUS";}return row.path(field).asText();}
    private static Map<String,Object> relationship(List<ObjectNode> rows,JsonNode p,boolean includePoints){
        String mode=p.path("relationshipMode").asText();if(mode.equals("SCATTER")){String x=p.path("xField").asText(),y=p.path("yField").asText();Selected selected=select(rows,List.of(x,y));var points=selected.rows.stream().map(r->new double[]{r.path(x).asDouble(),r.path(y).asDouble()}).toList();var result=map("relationshipMode",mode,"analysisRows",points.size(),"exclusions",selected.exclusions,"xField",x,"yField",y,"scatter",pearson(points));if(includePoints)result.put("points",selected.rows.stream().map(r->map("rowNumber",r.path("rowNumber").asInt(),"x",r.path(x).asDouble(),"y",r.path(y).asDouble())).toList());return result;}
        String group=p.path("groupBy").asText();Selected selected=select(rows,group.equals("days_to_first_lesson_band")?List.of("days_to_first_lesson"):List.of());var groups=new ArrayList<Map<String,Object>>();for(String key:GROUPS.get(group)){var item=map("key",key);item.putAll(completion(selected.rows.stream().filter(r->groupKey(r,group).equals(key)).toList()));groups.add(item);}return map("relationshipMode",mode,"analysisRows",selected.rows.size(),"exclusions",selected.exclusions,"groupBy",group,"groups",groups);
    }
    private static JsonNode rounded(JsonNode value){if(value.isFloatingPointNumber())return DecimalNode.valueOf(BigDecimal.valueOf(halfUp6(value.asDouble())).stripTrailingZeros());if(value.isArray()){ArrayNode out=JSON.createArrayNode();value.forEach(v->out.add(rounded(v)));return out;}if(value.isObject()){ObjectNode out=JSON.createObjectNode();value.fields().forEachRemaining(e->out.set(e.getKey(),rounded(e.getValue())));return out;}return value;}
    public static JsonNode calculate(String operation,JsonNode input,JsonNode raw,String datasetSha){
        validateRows(input);JsonNode p=DsSemantics.normalize(operation,raw);require(datasetSha!=null&&datasetSha.matches("[a-f0-9]{64}"));ObjectNode cleaning=JSON.createObjectNode();CLEAN.stream().sorted().forEach(k->cleaning.set(k,p.get(k)));String configSha=TaskContentRepository.hash(cleaning.toString().getBytes(StandardCharsets.UTF_8));
        Cleaned cleaned=clean(input,p);var rows=cleaned.rows;var result=map("schemaVersion","ds-result-v1","operationKey",operation,"datasetSha256",datasetSha,"cleaningConfigSha256",configSha,"inputRows",input.size(),"retainedRows",rows.size(),"uniqueLearners",rows.stream().map(r->r.path("learner_id").asText()).distinct().count(),"analysisRows",rows.size(),"exclusions",exclusions(),"quality",cleaned.quality);
        if(operation.equals("ds-profile")){String field=p.path("distributionField").asText();Selected selected=select(rows,List.of(field));var numbers=values(selected.rows,field);var bounds=BINS.get(field);var histogram=new ArrayList<Map<String,Object>>();for(int i=0;i<bounds.size()-1;i++){double lower=bounds.get(i),upper=bounds.get(i+1);boolean inclusive=i==bounds.size()-2;histogram.add(map("lower",lower,"upper",upper,"upperInclusive",inclusive,"count",numbers.stream().filter(v->v>=lower&&(inclusive?v<=upper:v<upper)).count()));}double sum=0;for(double value:numbers)sum+=value;Map<String,Object> fq=fieldQuality(rows).stream().filter(f->f.get("fieldKey").equals(field)).findFirst().orElseThrow();result.put("analysisRows",numbers.size());result.put("exclusions",selected.exclusions);result.put("profile",map("distributionField",field,"completion",completion(rows),"validCount",numbers.size(),"missingCount",fq.get("missingCount"),"notApplicableCount",fq.get("notApplicableCount"),"mean",numbers.isEmpty()?null:sum/numbers.size(),"minimum",quantile(numbers,0),"q25",quantile(numbers,.25),"median",quantile(numbers,.5),"q75",quantile(numbers,.75),"maximum",quantile(numbers,1),"histogram",histogram));}
        if(Set.of("ds-relationship","ds-stratify").contains(operation)){var overall=relationship(rows,p,operation.equals("ds-relationship"));result.put("analysisRows",overall.get("analysisRows"));result.put("exclusions",overall.get("exclusions"));if(operation.equals("ds-relationship"))result.put("relationship",overall);else{String field=p.path("stratifyBy").asText();var strata=new ArrayList<Map<String,Object>>();for(String key:GROUPS.get(field)){var part=rows.stream().filter(r->groupKey(r,field).equals(key)).toList();strata.add(map("key",key,"retainedRows",part.size(),"summary",relationship(part,p,false)));}result.put("stratified",map("stratifyBy",field,"overall",overall,"strata",strata));}}
        JsonNode out=rounded(JSON.valueToTree(result));require(out.toString().getBytes(StandardCharsets.UTF_8).length<=102400);return out;
    }
}
