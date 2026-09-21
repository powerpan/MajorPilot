package com.ruoyi.majorpilot.businessanalytics;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.datascience.DsAssets;
import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BaStatisticsTest {
    static final ObjectMapper JSON=new ObjectMapper();
    static JsonNode asset(String key)throws Exception{return JSON.readTree(BaStatisticsTest.class.getClassLoader().getResourceAsStream("task-content/ba-learning/1.0.0/"+key+".json"));}
    static ObjectNode windows(){return JSON.createObjectNode().put("baselineStartWeek",1).put("baselineEndWeek",6).put("comparisonStartWeek",7).put("comparisonEndWeek",12);}
    static ObjectNode metric(){return windows().put("numerator","completed_count").put("denominator","enrolled_count");}
    static ObjectNode segment(){return metric().put("segmentBy","course_track").put("focusTransitionKey",BaSemantics.TRANSITIONS.getFirst());}
    static ObjectNode action(){return JSON.createObjectNode().put("targetSegmentKey","APPLIED").put("successMetric","FIRST_LESSON_RATE").put("targetChangePercentagePoints",2).put("guardrailMetric","SUPPORT_CONTACTS_PER_100_ENROLLED").put("guardrailMaximum",180).put("reviewAfterDays",28);}
    static JsonNode calculate(String op,JsonNode rows,JsonNode p){return BaStatistics.calculate(op,rows,p,"0".repeat(64));}
    static ArrayNode zeros()throws Exception{ArrayNode result=(ArrayNode)asset("weekly-funnel");for(JsonNode r:result)for(String k:BaStatistics.COUNTS)((ObjectNode)r).put(k,0);return result;}
    static void code(String code,Runnable fn){assertEquals(code,assertThrows(ApiException.class,fn::run).code);}
    @Test void allTenFullJsGoldensMatchJavaExactlyAndSchemas()throws Exception{
        JsonNode rows=asset("weekly-funnel"),g=asset("golden-private"),m=asset("manifest");assertEquals(10,g.path("cases").size());
        for(JsonNode c:g.path("cases")){var out=BaStatistics.calculate(c.path("operationKey").asText(),rows,c.path("parameters"),g.path("datasetSha256").asText());assertTrue(DsAssets.equivalent(c.path("result"),out),c.path("name").asText());JsonNode op=null;for(JsonNode o:m.path("operations"))if(o.path("operationKey").equals(c.path("operationKey")))op=o;assertNotNull(op);TaskInputValidator.validate(op.path("resultSchema"),out,true);assertTrue(out.toString().getBytes(StandardCharsets.UTF_8).length<=102400);}
    }
    @Test void loaderRecomputesProvenanceAndKeepsPrivateAssetsPrivate()throws Exception{
        var repo=new TaskContentRepository(JSON);var bundle=repo.get("ba-learning/1.0.0/manifest.json");var m=bundle.manifest();var version=new TaskContent.Version(1,m.path("taskVersionId").asText(),"MAJOR","BUSINESS_ANALYTICS",null,"1.0.0",bundle.manifestSha256(),m);
        var publicManifest=TaskContentViews.publicManifest(version);for(String key:List.of("golden-private","review-private","source-provenance-private")){assertFalse(publicManifest.toString().contains(key));code("CONTENT_UNAVAILABLE",()->repo.asset(bundle,key,true));}
        var actual=new BaMetricsEngine(repo,JSON).calculate(version,m.path("operations").get(0),metric());assertTrue(DsAssets.equivalent(actual,asset("golden-private").at("/cases/0/result")));
        var assets=new HashMap<String,byte[]>();for(var a:m.path("assets"))assets.put(a.path("assetKey").asText(),repo.asset(bundle,a.path("assetKey").asText(),false));code("CONTENT_INTEGRITY_FAILED",()->BaAssets.validate(assets,"{}".getBytes(StandardCharsets.UTF_8)));
    }
    @Test void independentDefaultTotalsAndConditionalDenominators()throws Exception{
        JsonNode rows=asset("weekly-funnel"),copy=rows.deepCopy();var r=calculate("ba-metric",rows,metric());assertEquals(100,r.at("/baseline/numeratorCount").asInt());assertEquals(180,r.at("/baseline/denominatorCount").asInt());assertEquals(58,r.at("/comparison/numeratorCount").asInt());assertEquals(179,r.at("/comparison/denominatorCount").asInt());assertEquals(-23.153321,r.path("deltaPercentagePoints").asDouble());assertEquals(-.416760,r.path("relativeChange").asDouble());
        var c=calculate("ba-metric",rows,metric().put("denominator","first_lesson_count"));assertEquals(166,c.at("/baseline/denominatorCount").asInt());assertEquals(142,c.at("/comparison/denominatorCount").asInt());assertEquals(-19.395893,c.path("deltaPercentagePoints").asDouble());assertEquals(copy,rows);
    }
    @Test void countsAreWeightedAndSupportEventsAreNotPercentages()throws Exception{
        var rows=zeros();var a=(ObjectNode)rows.get(0);a.put("enrolled_count",100).put("first_lesson_count",20).put("week_one_active_count",10).put("assignment_started_count",10).put("assignment_submitted_count",10).put("completed_count",10).put("support_contact_count",300);var b=(ObjectNode)rows.get(6);for(String k:BaSemantics.STAGES)b.put(k,1);
        assertEquals(.108911,calculate("ba-metric",rows,metric()).at("/baseline/rate").asDouble());var f=calculate("ba-funnel",rows,windows());assertEquals(.108911,f.at("/stages/2/baseline/cumulativeRate").asDouble());assertEquals(.523810,f.at("/transitions/1/baseline/conversionRate").asDouble());assertEquals(10,f.at("/transitions/1/baseline/lossCount").asInt());assertEquals(297.029703,calculate("ba-segments",rows,segment()).at("/segments/0/baseline/supportContactsPer100Enrolled").asDouble());
    }
    @Test void honestNullsZeroBaselineAndExactHalfUp()throws Exception{
        var rows=zeros();var empty=calculate("ba-metric",rows,metric());assertTrue(empty.at("/baseline/rate").isNull());assertTrue(empty.path("deltaPercentagePoints").isNull());assertTrue(empty.path("relativeChange").isNull());var f=calculate("ba-funnel",rows,windows());assertTrue(f.at("/stages/0/baseline/cumulativeRate").isNull());assertEquals(0,f.at("/transitions/0/baseline/lossCount").asInt());
        ((ObjectNode)rows.get(0)).put("enrolled_count",128);ObjectNode c=(ObjectNode)rows.get(36);for(String k:BaSemantics.STAGES)c.put(k,1);c.put("enrolled_count",128);var out=calculate("ba-metric",rows,metric());assertEquals(.007813,out.at("/comparison/rate").asDouble());assertEquals(.78125,out.path("deltaPercentagePoints").asDouble());assertTrue(out.path("relativeChange").isNull());
        ObjectNode first=(ObjectNode)rows.get(0);for(String k:BaSemantics.STAGES)first.put(k,1);first.put("enrolled_count",512);c.put("enrolled_count",512).put("completed_count",0);assertEquals(-.195313,calculate("ba-metric",rows,metric()).path("deltaPercentagePoints").asDouble());
    }
    @Test void parametersAndRowsRejectUnknownCoercionWindowAndOverflow()throws Exception{
        code("BA_PARAMETERS_INVALID",()->BaSemantics.validate("ba-metric",metric().put("baselineStartWeek","1")));code("BA_PARAMETERS_INVALID",()->BaSemantics.validate("ba-metric",metric().put("baselineStartWeek",1.5)));code("BA_PARAMETERS_INVALID",()->BaSemantics.validate("ba-metric",metric().put("comparisonStartWeek",6)));code("BA_PARAMETERS_INVALID",()->BaSemantics.validate("ba-funnel",metric()));code("BA_PARAMETERS_INVALID",()->BaSemantics.validate("ba-segments",segment().put("segmentBy","learner_id")));
        var duplicate=(ArrayNode)asset("weekly-funnel");duplicate.set(1,duplicate.get(0).deepCopy());code("BA_DATA_INVALID",()->BaStatistics.validateRows(duplicate));var overflow=zeros();((ObjectNode)overflow.get(0)).put("enrolled_count",9007199254740991L);((ObjectNode)overflow.get(1)).put("enrolled_count",1);code("BA_DATA_INVALID",()->BaStatistics.validateRows(overflow));
    }
    @Test void actionOnlyValidatesCurrentSelectedComparisonWithoutAnOperation()throws Exception{
        JsonNode rows=asset("weekly-funnel"),p=segment(),result=calculate("ba-segments",rows,p);BaSemantics.validateAction(action(),p,"APPLIED",result);BaSemantics.validateAction(action().put("guardrailMaximum",0).put("reviewAfterDays",42),p,"APPLIED",result);
        for(ObjectNode input:List.of(action().put("targetSegmentKey","FOUNDATIONS"),action().put("successMetric","STARTER_COMPLETION_RATE"),action().put("targetChangePercentagePoints",0),action().put("targetChangePercentagePoints",100),action().put("targetChangePercentagePoints","2"),action().put("guardrailMaximum",-1),action().put("reviewAfterDays",7),action().put("baseline",.3)))code("BA_ACTION_INVALID",()->BaSemantics.validateAction(input,p,"APPLIED",result));
        code("BA_ACTION_INVALID",()->BaSemantics.validateAction(action(),segment().put("baselineEndWeek",5).put("comparisonEndWeek",11),"APPLIED",result));var conditional=segment().put("denominator","first_lesson_count");BaSemantics.validateAction(action().put("successMetric","STARTER_COMPLETION_RATE"),conditional,"APPLIED",calculate("ba-segments",rows,conditional));
        code("BA_ACTION_INVALID",()->BaSemantics.validateAction(action().put("reviewAfterDays",4294967324L),p,"APPLIED",result));
        var empty=zeros();code("BA_ACTION_INVALID",()->BaSemantics.validateAction(action(),p,"APPLIED",calculate("ba-segments",empty,p)));var boundary=zeros();((ObjectNode)boundary.get(39)).put("enrolled_count",3).put("first_lesson_count",2);var b=calculate("ba-segments",boundary,p);BaSemantics.validateAction(action().put("targetChangePercentagePoints",33.333333),p,"APPLIED",b);code("BA_ACTION_INVALID",()->BaSemantics.validateAction(action().put("targetChangePercentagePoints",33.333334),p,"APPLIED",b));code("BA_PARAMETERS_INVALID",()->BaSemantics.validate("ba-action",JSON.createObjectNode()));
    }
}
