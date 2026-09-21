package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TaskContentTest {
    private static final ObjectMapper JSON=new ObjectMapper();
    private final TaskContentRepository repository=new TaskContentRepository(JSON);
    private JsonNode manifest(){return repository.get("demo-table/1.0.0/manifest.json").manifest();}
    @Test void realBaAdapterIsWiredAndComputesTheCataloguedDataset()throws Exception{
        try(var context=new org.springframework.context.annotation.AnnotationConfigApplicationContext()){
            context.getEnvironment().setActiveProfiles("local");context.registerBean(ObjectMapper.class,()->JSON);context.register(TaskContentRepository.class,com.ruoyi.majorpilot.businessanalytics.BaMetricsEngine.class);context.refresh();
            var bundle=context.getBean(TaskContentRepository.class).get("ba-learning/1.0.0/manifest.json");var m=bundle.manifest();var version=new TaskContent.Version(1,m.path("taskVersionId").asText(),"MAJOR","BUSINESS_ANALYTICS",null,"1.0.0",bundle.manifestSha256(),m);
            var parameters=JSON.readTree("{\"numerator\":\"completed_count\",\"denominator\":\"enrolled_count\",\"baselineStartWeek\":1,\"baselineEndWeek\":6,\"comparisonStartWeek\":7,\"comparisonEndWeek\":12}");
            var result=context.getBean(com.ruoyi.majorpilot.businessanalytics.BaMetricsEngine.class).calculate(version,m.path("operations").get(0),parameters);assertEquals(100,result.at("/baseline/numeratorCount").asInt());assertEquals(58,result.at("/comparison/numeratorCount").asInt());assertEquals(179,result.at("/comparison/denominatorCount").asInt());
        }
    }
    @Test void baV4KeepsExactParameterSourcesAndEmptyFunnelOwnBindings(){
        var bundle=repository.get("ba-learning/1.0.0/manifest.json");var manifest=bundle.manifest();assertDoesNotThrow(()->TaskManifestValidator.validate(manifest));assertEquals(3,manifest.path("operations").size());
        JsonNode funnel=manifest.path("operations").get(1);assertEquals("ba-funnel",funnel.path("operationKey").asText());assertTrue(funnel.path("ownResponseBindings").isEmpty());assertEquals(4,funnel.path("inputBindings").size());
        for(String mutation:List.of("binding","engine","asset","quota","step")){
            var changed=(ObjectNode)bundle.manifest();switch(mutation){
                case "binding"->((ObjectNode)changed.at("/operations/1/inputBindings/0")).put("sourceStepKey","b1-context");
                case "engine"->((ObjectNode)changed.at("/operations/0")).put("engineType","DATA_ANALYSIS");
                case "asset"->{for(var asset:changed.path("assets"))if(asset.path("assetKey").asText().equals("source-provenance-private"))((ObjectNode)asset).put("visibility","PUBLIC");}
                case "quota"->((ObjectNode)changed.at("/operations/0")).put("maxEvaluations",5);
                case "step"->((ObjectNode)changed.at("/steps/5")).put("operationKey","ba-metric");
            }assertThrows(ApiException.class,()->TaskManifestValidator.validate(changed),mutation);
        }
        var version=new TaskContent.Version(1,manifest.path("taskVersionId").asText(),"MAJOR","BUSINESS_ANALYTICS",null,"1.0.0",bundle.manifestSha256(),manifest);String publicView=TaskContentViews.publicManifest(version).toString();
        assertTrue(publicView.contains("ownResponseBindings"));assertFalse(publicView.contains("source-provenance-private"));assertFalse(publicView.contains("canonical-events-private"));assertFalse(publicView.contains("privateAssetKeys"));
    }
    @Test void immutableHashVerifiedDemosDoNotImpersonateMajors(){var demos=repository.bundles().stream().filter(b->b.manifest().path("contentKind").asText().equals("DEMO")).toList();assertEquals(2,demos.size());for(var bundle:demos){assertTrue(bundle.manifest().path("majorCode").isNull());((ObjectNode)bundle.manifest()).put("title","tampered");assertNotEquals("tampered",bundle.manifest().path("title").asText());}assertEquals(26,manifest().path("taskVersionId").asText().length());}
    @Test void privatePathsHashesAndStaticHintsAreNotInStudentProjection(){JsonNode m=manifest();TaskContent.Version version=new TaskContent.Version(1,m.path("taskVersionId").asText(),"DEMO",null,"DEMO_TABLE","1.0.0","a".repeat(64),m);String projected=TaskContentViews.publicManifest(version).toString();for(String marker:List.of("internal-review","review.json","privateAssetKeys","datasetAssetKey","hintContextFields","evidenceFields","\"hints\""))assertFalse(projected.contains(marker),marker);assertThrows(ApiException.class,()->repository.asset(repository.get("demo-table/1.0.0/manifest.json"),"internal-review",true));}
    @Test void unknownFieldsTraversalCyclesBadReviewAndPrivateReferencesFail(){for(String mutation:List.of("unknown","path","cycle","private","hint","evidence","review")){ObjectNode m=(ObjectNode)manifest();switch(mutation){case "unknown"->m.put("unknown",true);case "path"->((ObjectNode)m.at("/assets/0")).put("path","../secrets");case "cycle"->((ObjectNode)m.at("/steps/0")).putArray("dependencies").add("submit");case "private"->((ObjectNode)m.at("/steps/0")).putArray("assetKeys").add("internal-review");case "hint"->((ObjectNode)m.at("/steps/0")).putArray("hints");case "evidence"->((ObjectNode)m.at("/steps/0")).putArray("evidenceFields").add("personality");case "review"->((ObjectNode)m.path("review")).put("professionalReviewRequired",true);}assertThrows(ApiException.class,()->TaskManifestValidator.validate(m),mutation);}}
    @Test void draftAllowsPartialButCompletionRequiresFieldsAndTrueAcknowledgement()throws Exception{JsonNode schema=manifest().at("/steps/0/inputSchema");assertDoesNotThrow(()->TaskInputValidator.validate(schema,JSON.createObjectNode(),false));assertThrows(ApiException.class,()->TaskInputValidator.validate(schema,JSON.createObjectNode(),true));assertThrows(ApiException.class,()->TaskInputValidator.validate(schema,JSON.readTree("{\"acknowledged\":false}"),true));assertDoesNotThrow(()->TaskInputValidator.validate(schema,JSON.readTree("{\"acknowledged\":true}"),true));JsonNode observation=manifest().at("/steps/3/inputSchema");assertDoesNotThrow(()->TaskInputValidator.validate(observation,JSON.readTree("{\"observation\":\"未写完\"}"),false));assertThrows(ApiException.class,()->TaskInputValidator.validate(observation,JSON.readTree("{\"observation\":\"未写完\"}"),true));}
    @Test void scalarCoercionExtraFieldsAndInvalidUnicodeAreRejected()throws Exception{JsonNode schema=manifest().at("/steps/2/inputSchema");for(String input:List.of("{\"multiplier\":\"2\",\"include\":\"ALL\"}","{\"multiplier\":2.5,\"include\":\"ALL\"}","{\"multiplier\":2,\"include\":\"ALL\",\"score\":100}"))assertThrows(ApiException.class,()->TaskInputValidator.validate(schema,JSON.readTree(input),true));ObjectNode bad=JSON.createObjectNode().put("observation","bad\uD800");assertThrows(ApiException.class,()->TaskInputValidator.validate(manifest().at("/steps/3/inputSchema"),bad,false));}
    @Test void unsupportedExecutableOrExternalSchemaIsRejected(){ObjectNode schema=(ObjectNode)manifest().at("/steps/0/inputSchema");schema.put("$ref","https://example.invalid");assertThrows(ApiException.class,()->TaskInputValidator.validateSchema(schema));}
}
