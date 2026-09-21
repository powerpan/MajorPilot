package com.ruoyi.majorpilot.businessanalytics;

import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.shared.ApiException;
import java.math.*;
import java.util.*;
import static com.ruoyi.majorpilot.businessanalytics.BaSemantics.*;

/** Count-based exact rational calculations. No fitted model or inferred business outcome. */
public final class BaStatistics {
    public static final List<String> COUNTS;public static final List<String> ROW_KEYS;
    private static final long SAFE_INTEGER=9007199254740991L;
    static {var counts=new ArrayList<>(STAGES);counts.add("support_contact_count");COUNTS=List.copyOf(counts);var keys=new ArrayList<>(List.of("week","course_track","signup_source"));keys.addAll(COUNTS);ROW_KEYS=List.copyOf(keys);}
    private BaStatistics(){}
    private static void check(boolean v){require(v,"BA_DATA_INVALID");}
    private static boolean count(JsonNode n){return n!=null&&n.isIntegralNumber()&&n.canConvertToLong()&&n.asLong()>=0&&n.asLong()<=SAFE_INTEGER;}
    static void validateCounts(JsonNode row,JsonNode support){
        long previous=SAFE_INTEGER;for(String key:STAGES){JsonNode n=row.get(key);check(count(n)&&n.asLong()<=previous);previous=n.asLong();}
        check(count(support)&&(row.path("enrolled_count").asLong()>0||support.asLong()==0));
    }
    public static void validateRows(JsonNode rows){
        check(rows!=null&&rows.isArray()&&rows.size()==72);var seen=new HashSet<String>();var totals=new HashMap<String,Long>();
        for(JsonNode row:rows){check(keys(row,ROW_KEYS));check(row.path("week").isIntegralNumber()&&row.path("week").canConvertToInt()&&row.path("week").asInt()>=1&&row.path("week").asInt()<=12);check(choice(row.get("course_track"),GROUPS.get("course_track"))&&choice(row.get("signup_source"),GROUPS.get("signup_source")));validateCounts(row,row.get("support_contact_count"));
            check(seen.add(row.path("week").asInt()+":"+row.path("course_track").asText()+":"+row.path("signup_source").asText()));
            for(String key:COUNTS){long total=totals.getOrDefault(key,0L)+row.path(key).asLong();check(total<=SAFE_INTEGER);totals.put(key,total);}}
    }
    private static Map<String,Object> map(Object... entries){var result=new LinkedHashMap<String,Object>();for(int i=0;i<entries.length;i+=2)result.put((String)entries[i],entries[i+1]);return result;}
    private static BigInteger bi(long n){return BigInteger.valueOf(n);}
    private static BigDecimal rounded(BigInteger n,BigInteger d,long scale){if(d.signum()==0)return null;BigDecimal result=new BigDecimal(n.multiply(bi(scale))).divide(new BigDecimal(d),6,RoundingMode.HALF_UP);return result.signum()==0?BigDecimal.ZERO:result;}
    private static BigDecimal ratio(long n,long d){return rounded(bi(n),bi(d),1);}
    private static BigDecimal delta(long bn,long bd,long cn,long cd){return bd==0||cd==0?null:rounded(bi(cn).multiply(bi(bd)).subtract(bi(bn).multiply(bi(cd))),bi(cd).multiply(bi(bd)),100);}
    private static BigDecimal relative(long bn,long bd,long cn,long cd){return bn==0||bd==0||cd==0?null:rounded(bi(cn).multiply(bi(bd)).subtract(bi(bn).multiply(bi(cd))),bi(bn).multiply(bi(cd)),1);}
    private static Map<String,Long> aggregate(JsonNode rows,int start,int end,String field,String value){var totals=new LinkedHashMap<String,Long>();COUNTS.forEach(k->totals.put(k,0L));for(JsonNode row:rows)if(row.path("week").asInt()>=start&&row.path("week").asInt()<=end&&(field==null||row.path(field).asText().equals(value)))for(String k:COUNTS)totals.put(k,totals.get(k)+row.path(k).asLong());return totals;}
    private static Map<String,Object> metric(Map<String,Long> r,String denominator){return map("numeratorCount",r.get("completed_count"),"denominatorCount",r.get(denominator),"rate",ratio(r.get("completed_count"),r.get(denominator)));}
    private static Map<String,Object> transition(Map<String,Long> r,int index){long n=r.get(STAGES.get(index+1)),d=r.get(STAGES.get(index));return map("numeratorCount",n,"denominatorCount",d,"conversionRate",ratio(n,d),"lossCount",d-n);}
    private static Map<String,Object> period(Map<String,Long> r,Map<String,Long> overall,String denominator,int index){var counts=new LinkedHashMap<String,Long>();STAGES.forEach(k->counts.put(k,r.get(k)));return map("stageCounts",counts,"enrolledShare",ratio(r.get("enrolled_count"),overall.get("enrolled_count")),"metric",metric(r,denominator),"focusTransition",transition(r,index),"supportContactCount",r.get("support_contact_count"),"supportContactsPer100Enrolled",rounded(bi(r.get("support_contact_count")),bi(r.get("enrolled_count")),100));}
    public static JsonNode calculate(String operation,JsonNode rows,JsonNode raw,String datasetSha256){
        JsonNode p=BaSemantics.normalize(operation,raw);validateRows(rows);check(datasetSha256!=null&&datasetSha256.matches("[a-f0-9]{64}"));
        int bs=p.path("baselineStartWeek").asInt(),be=p.path("baselineEndWeek").asInt(),cs=p.path("comparisonStartWeek").asInt(),ce=p.path("comparisonEndWeek").asInt();String denominator=p.path("denominator").asText();
        var b=aggregate(rows,bs,be,null,null);var c=aggregate(rows,cs,ce,null,null);
        var out=map("schemaVersion","ba-result-v1","operationKey",operation,"datasetSha256",datasetSha256,"windows",map("baseline",map("startWeek",bs,"endWeek",be),"comparison",map("startWeek",cs,"endWeek",ce)),"observation",map("windowDays",28,"cohortBasis","ENROLLMENT_WEEK","weekOneActiveBasis","FIRST_LESSON_7_DAYS_WITHIN_28_DAY_WINDOW"));
        if(operation.equals("ba-metric")){
            out.put("numerator","completed_count");out.put("denominator",denominator);out.put("baseline",metric(b,denominator));out.put("comparison",metric(c,denominator));out.put("deltaPercentagePoints",delta(b.get("completed_count"),b.get(denominator),c.get("completed_count"),c.get(denominator)));out.put("relativeChange",relative(b.get("completed_count"),b.get(denominator),c.get("completed_count"),c.get(denominator)));
            var trend=new ArrayList<Map<String,Object>>();for(int week=1;week<=12;week++){var item=map("week",week);item.putAll(metric(aggregate(rows,week,week,null,null),denominator));trend.add(item);}out.put("trend",trend);
        }else if(operation.equals("ba-funnel")){
            var stages=new ArrayList<Map<String,Object>>();for(String k:STAGES)stages.add(map("stageKey",k,"baseline",map("count",b.get(k),"cumulativeRate",ratio(b.get(k),b.get("enrolled_count"))),"comparison",map("count",c.get(k),"cumulativeRate",ratio(c.get(k),c.get("enrolled_count")))));out.put("stages",stages);
            var transitions=new ArrayList<Map<String,Object>>();for(int i=0;i<TRANSITIONS.size();i++)transitions.add(map("transitionKey",TRANSITIONS.get(i),"fromStageKey",STAGES.get(i),"toStageKey",STAGES.get(i+1),"baseline",transition(b,i),"comparison",transition(c,i),"deltaPercentagePoints",delta(b.get(STAGES.get(i+1)),b.get(STAGES.get(i)),c.get(STAGES.get(i+1)),c.get(STAGES.get(i)))));out.put("transitions",transitions);
        }else{
            String by=p.path("segmentBy").asText(),focus=p.path("focusTransitionKey").asText();int index=TRANSITIONS.indexOf(focus);out.put("numerator","completed_count");out.put("denominator",denominator);out.put("segmentBy",by);out.put("focusTransitionKey",focus);
            var segments=new ArrayList<Map<String,Object>>();for(String key:GROUPS.get(by)){var gb=aggregate(rows,bs,be,by,key);var gc=aggregate(rows,cs,ce,by,key);segments.add(map("segmentKey",key,"baseline",period(gb,b,denominator,index),"comparison",period(gc,c,denominator,index),"metricDeltaPercentagePoints",delta(gb.get("completed_count"),gb.get(denominator),gc.get("completed_count"),gc.get(denominator)),"transitionDeltaPercentagePoints",delta(gb.get(STAGES.get(index+1)),gb.get(STAGES.get(index)),gc.get(STAGES.get(index+1)),gc.get(STAGES.get(index)))));}out.put("segments",segments);
        }
        return JSON.valueToTree(out);
    }
}
