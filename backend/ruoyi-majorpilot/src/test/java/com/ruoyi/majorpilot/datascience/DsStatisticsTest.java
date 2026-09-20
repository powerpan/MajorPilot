package com.ruoyi.majorpilot.datascience;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DsStatisticsTest {
    static final ObjectMapper JSON=new ObjectMapper();
    static JsonNode asset(String key)throws Exception{return JSON.readTree(DsStatisticsTest.class.getClassLoader().getResourceAsStream("task-content/ds-learning/1.0.0/"+key+".json"));}
    static ObjectNode base(){return JSON.createObjectNode().put("duplicatePolicy","DROP_EXACT").put("missingPolicy","KEEP_NULL").put("extremePolicy","KEEP");}
    static ObjectNode scatter(){return base().put("relationshipMode","SCATTER").put("xField","avg_session_minutes").put("yField","assignment_submit_rate");}
    static ObjectNode toy(int id)throws Exception{return ((ObjectNode)asset("learner-activity").get(0)).deepCopy().put("learner_id",String.format("learner-%03d",id)).put("lessons_started",1).put("lessons_completed",0).put("completed",false).put("avg_session_minutes",0).put("days_to_first_lesson",0).put("assignment_submit_rate",0);}
    static JsonNode calculate(String operation,JsonNode rows,JsonNode p){return DsStatistics.calculate(operation,rows,p,"0".repeat(64));}
    @Test void allTenFullJavascriptGoldensMatchJavaAndSchema()throws Exception{
        JsonNode rows=asset("learner-activity"),g=asset("golden-private"),manifest=asset("manifest");int cases=0;
        for(JsonNode c:g.path("cases")){JsonNode actual=DsStatistics.calculate(c.path("operationKey").asText(),rows,c.path("parameters"),g.path("datasetSha256").asText());assertTrue(DsAssets.equivalent(c.path("result"),actual),c.path("name").asText());JsonNode operation=null;for(var o:manifest.path("operations"))if(o.path("operationKey").equals(c.path("operationKey")))operation=o;assertNotNull(operation);TaskInputValidator.validate(operation.path("resultSchema"),actual,true);assertTrue(actual.toString().getBytes(StandardCharsets.UTF_8).length<=102400);cases++;}assertEquals(10,cases);
    }
    @Test void contentLoaderValidatesSourceFactsAndKeepsPrivateAssetsPrivate()throws Exception{
        var repository=new TaskContentRepository(JSON);var bundle=repository.get("ds-learning/1.0.0/manifest.json");JsonNode m=bundle.manifest();TaskManifestValidator.validate(m);
        var version=new TaskContent.Version(1,m.path("taskVersionId").asText(),"MAJOR","DATA_SCIENCE",null,"1.0.0",bundle.manifestSha256(),m);JsonNode projected=TaskContentViews.publicManifest(version);assertEquals(3,projected.at("/operations/0/ownResponseBindings").size());for(String privateKey:List.of("canonical-events-private","golden-private","review-private")){assertFalse(projected.toString().contains(privateKey));assertThrows(ApiException.class,()->repository.asset(bundle,privateKey,true));}
        var engine=new DsStatsEngine(repository,JSON);JsonNode operation=m.path("operations").get(0);ObjectNode expected=(ObjectNode)calculate("ds-quality-clean",asset("learner-activity"),base());expected.put("datasetSha256",asset("golden-private").path("datasetSha256").asText());assertTrue(DsAssets.equivalent(engine.calculate(version,operation,base()),expected));
    }
    @Test void countPoliciesAndInputImmutability()throws Exception{JsonNode rows=asset("learner-activity"),snapshot=rows.deepCopy();var keep=calculate("ds-quality-clean",rows,base());var drop=calculate("ds-quality-clean",rows,base().put("missingPolicy","DROP_MISSING"));var median=calculate("ds-quality-clean",rows,base().put("missingPolicy","MEDIAN_NUMERIC"));assertEquals(359,keep.path("retainedRows").asInt());assertEquals(335,drop.path("retainedRows").asInt());assertEquals(1,keep.at("/quality/duplicateRows").asInt());assertEquals(359,median.path("retainedRows").asInt());int filled=0;for(var f:median.at("/quality/imputations"))filled+=f.path("count").asInt();assertEquals(24,filled);assertEquals(snapshot,rows);}
    @Test void pairwiseExclusionsAndMeansDoNotLoseZeroOrDoubleCount()throws Exception{
        var data=JSON.createArrayNode().add(toy(1)).add(toy(2).put("avg_session_minutes",10).put("assignment_submit_rate",1)).add(toy(3).putNull("avg_session_minutes")).add(toy(4).put("lessons_started",0).putNull("avg_session_minutes").putNull("days_to_first_lesson")).add(toy(5).put("lessons_started",0).putNull("avg_session_minutes").putNull("days_to_first_lesson").putNull("assignment_submit_rate"));
        JsonNode result=calculate("ds-relationship",data,scatter());assertEquals(2,result.path("analysisRows").asInt());assertEquals(3,result.at("/exclusions/total").asInt());for(String k:List.of("missingOnly","notApplicableOnly","both"))assertEquals(1,result.path("exclusions").path(k).asInt());assertEquals(5,result.at("/relationship/scatter/meanX").asDouble());assertEquals(.5,result.at("/relationship/scatter/meanY").asDouble());assertEquals(1,result.at("/relationship/scatter/r").asDouble());assertEquals(0,result.at("/relationship/points/0/x").asDouble());
        JsonNode filled=calculate("ds-quality-clean",data,base().put("missingPolicy","MEDIAN_NUMERIC"));assertEquals(2,filled.at("/quality/after/0/notApplicableCount").asInt());assertEquals(5,filled.at("/quality/imputations/0/median").asDouble());
    }
    @Test void zeroAndSmallSamplesHaveHonestNulls()throws Exception{
        for(JsonNode rows:List.of(JSON.createArrayNode(),JSON.createArrayNode().add(toy(1).putNull("avg_session_minutes")))){var result=calculate("ds-relationship",rows,scatter());assertEquals(0,result.at("/relationship/scatter/n").asInt());for(String key:List.of("meanX","meanY","r"))assertTrue(result.path("relationship").path("scatter").path(key).isNull());}
        var filled=calculate("ds-quality-clean",JSON.createArrayNode().add(toy(1).putNull("avg_session_minutes")),base().put("missingPolicy","MEDIAN_NUMERIC"));assertTrue(filled.at("/quality/imputations/0/median").isNull());assertEquals(0,filled.at("/quality/imputations/0/count").asInt());assertNull(DsStatistics.pearson(List.of(new double[]{2,3})).get("r"));assertNull(DsStatistics.pearson(List.of(new double[]{1,0},new double[]{1,1})).get("r"));assertEquals(-1.,DsStatistics.pearson(List.of(new double[]{0,2},new double[]{1,1},new double[]{2,0})).get("r"));
    }
    @Test void quantileBinsWilsonAndRoundingBoundaries()throws Exception{
        assertEquals(28.5,DsStatistics.halfUp6(DsStatistics.quantile(List.of(30.,0.,10.,20.),.95)));assertNull(DsStatistics.quantile(List.of(),.5));assertEquals(2.,DsStatistics.quantile(List.of(1.,3.),.5));assertNull(DsStatistics.wilson(0,0).get("lower"));assertEquals(.206549,DsStatistics.halfUp6((double)DsStatistics.wilson(1,1).get("lower")));assertEquals(.793451,DsStatistics.halfUp6((double)DsStatistics.wilson(0,1).get("upper")));assertEquals(-1.234568,DsStatistics.halfUp6(-1.2345675));assertEquals(1.234568,DsStatistics.halfUp6(1.2345675));
        var rows=JSON.createArrayNode();int i=0;for(int value:List.of(0,10,20,40,80,240))rows.add(toy(++i).put("avg_session_minutes",value));JsonNode out=calculate("ds-profile",rows,base().put("distributionField","avg_session_minutes"));var counts=new ArrayList<Integer>();for(var bin:out.at("/profile/histogram"))counts.add(bin.path("count").asInt());assertEquals(List.of(1,1,1,1,2),counts);
    }
    @Test void stratificationDoesNotAverageLayerCorrelations()throws Exception{
        var data=JSON.createArrayNode().add(toy(1).put("course_track","FOUNDATIONS").put("avg_session_minutes",0).put("assignment_submit_rate",.25)).add(toy(2).put("course_track","FOUNDATIONS").put("avg_session_minutes",1).put("assignment_submit_rate",0)).add(toy(3).put("course_track","APPLIED").put("avg_session_minutes",10).put("assignment_submit_rate",1)).add(toy(4).put("course_track","APPLIED").put("avg_session_minutes",11).put("assignment_submit_rate",.75));
        var result=calculate("ds-stratify",data,scatter().put("stratifyBy","course_track"));assertTrue(result.at("/stratified/overall/scatter/r").asDouble()>.8);for(var s:result.at("/stratified/strata"))assertEquals(-1,s.at("/summary/scatter/r").asDouble());assertFalse(result.path("stratified").toString().contains("points"));
    }
    @Test void sameValidatorRejectsInactiveOrMissingBranchesAndUnknownInputs()throws Exception{
        assertThrows(ApiException.class,()->DsSemantics.validate("ds-relationship",scatter().put("xField","assignment_submit_rate")));assertThrows(ApiException.class,()->DsSemantics.validate("ds-relationship",scatter().put("groupBy","device_group")));ObjectNode absent=scatter();absent.remove("yField");assertThrows(ApiException.class,()->DsSemantics.validate("ds-relationship",absent));assertThrows(ApiException.class,()->DsSemantics.validate("ds-stratify",base().put("relationshipMode","GROUP_COMPLETION").put("groupBy","course_track").put("stratifyBy","course_track")));assertThrows(ApiException.class,()->DsSemantics.validate("ds-profile",base().put("distributionField","avg_session_minutes").put("code","x")));assertThrows(ApiException.class,()->DsStatistics.validateRows(JSON.createArrayNode().add(toy(1).put("avg_session_minutes",241))));
    }
    @Test void v3BindingsMustBeUniqueTypedOptionalCompatibleAndRealAncestors()throws Exception{
        var a=(ObjectNode)asset("manifest");((ArrayNode)a.at("/operations/0/ownResponseBindings")).add(a.at("/operations/0/ownResponseBindings/0"));assertThrows(ApiException.class,()->TaskManifestValidator.validate(a));
        var b=(ObjectNode)asset("manifest");((ObjectNode)b.at("/operations/1/inputBindings/0")).put("sourceStepKey","d6-conclusion");assertThrows(ApiException.class,()->TaskManifestValidator.validate(b));
        var c=(ObjectNode)asset("manifest");((ArrayNode)c.at("/operations/2/parametersSchema/required")).add("xField");assertThrows(ApiException.class,()->TaskManifestValidator.validate(c));
        var d=(ObjectNode)asset("manifest");((ObjectNode)d.at("/operations/0")).put("datasetAssetKey","canonical-events-private");assertThrows(ApiException.class,()->TaskManifestValidator.validate(d));
    }
}
