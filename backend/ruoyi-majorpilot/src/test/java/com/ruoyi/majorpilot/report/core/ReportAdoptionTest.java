package com.ruoyi.majorpilot.report.core;

import static com.ruoyi.majorpilot.report.core.ReportModels.*;
import static com.ruoyi.majorpilot.report.core.ReportTestFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import org.junit.jupiter.api.Test;

/** Only synthetic pinned sources: no database mutation or provider traffic. */
class ReportAdoptionTest {
    final ReportCore core=new ReportCore(JSON);

    @Test void historicalStandardSerializationAndCatalogRemainByteCompatible() throws Exception {
        var input=experience("BUSINESS_ANALYTICS",true);var original=input.sources().getFirst().pins();
        ObjectNode expected=JSON.createObjectNode();
        expected.put("runId",original.runId()).put("runMode",original.runMode()).put("contentKind",original.contentKind())
            .put("runStatus",original.runStatus()).put("taskVersionId",original.taskVersionId())
            .put("taskManifestSha256",original.taskManifestSha256()).put("taskVersionCode",original.taskVersionCode())
            .put("taskTitle",original.taskTitle()).put("decisionProfileId",original.decisionProfileId())
            .put("profileSha256",original.profileSha256()).put("closedInputSha256",original.closedInputSha256())
            .put("questionSetVersion",original.questionSetVersion());
        expected.set("stepTitles",JSON.valueToTree(original.stepTitles()));
        assertEquals(expected.toString(),JSON.writeValueAsString(original));
        assertFalse(JSON.valueToTree(original).has("productAuthorization"));
        var restored=JSON.treeToValue(expected,SourcePins.class);assertNull(restored.productAuthorization());
        assertEquals(core.hash(expected),core.hash(JSON.valueToTree(restored)));
        var roundTrip=JSON.readValue(JSON.writeValueAsString(input),ReportInput.class);
        assertEquals(core.compile(input).catalogSha256(),core.compile(roundTrip).catalogSha256());
        assertEquals(core.hash(JSON.valueToTree(core.compile(input))),core.hash(JSON.valueToTree(core.compile(roundTrip))));
        assertEquals(core.fallback(input,core.compile(input)).bodySha256(),core.fallback(roundTrip,core.compile(roundTrip)).bodySha256());
    }

    @Test void onlyExplicitPinnedPreviewProvenanceEntersTheSameSchemaAndKeepsMode() throws Exception {
        var input=authorized(experience("BUSINESS_ANALYTICS",true));
        assertEquals("REVIEW_PREVIEW",input.sources().getFirst().pins().runMode());
        var catalog=core.compile(input);var result=core.fallback(input,catalog);
        assertEquals("report-v1",result.publicReportJson().path("schemaVersion").asText());
        assertTrue(result.publicReportJson().path("limitations").toString().contains("专业内容审核仍待完成"));
        assertTrue(result.validation().valid());
        var roundTrip=JSON.readValue(JSON.writeValueAsString(input),ReportInput.class);
        assertEquals(catalog.catalogSha256(),core.compile(roundTrip).catalogSha256());
        String model=core.modelInput(catalog).content().toString(),body=result.publicReportJson().toString();
        for(String privateField:List.of("productAuthorization","authorizationReference","PROJECT_OWNER_REQUEST","closedInputSha256","LOCAL_ACCEPTANCE_FIXTURE")){
            assertFalse(model.contains(privateField),privateField);assertFalse(body.contains(privateField),privateField);
        }
    }

    @Test void unqualifiedPreviewAndStandardWithProvenanceBothFailClosed(){
        var original=experience("AI",true);var p=original.sources().getFirst().pins();
        assertInvalid(repin(original,copy(p,"REVIEW_PREVIEW",null)));
        assertInvalid(repin(original,copy(p,"STANDARD",proof(p))));
        assertInvalid(repin(original,copy(p,"DEMO",proof(p))));
    }

    @Test void staleHashUnknownAuthorityAndFutureAuthorizationCannotBeRepaired(){
        var original=experience("BUSINESS_ANALYTICS",true);var p=original.sources().getFirst().pins();var good=proof(p);
        for(var invalid:List.of(
            new ProductAuthorization(good.authorizationId(),"ENGINEERING_REVIEW",good.authorizationReference(),good.authorizedAt(),good.originalRunMode(),good.taskManifestSha256(),good.closedInputSha256()),
            new ProductAuthorization(good.authorizationId(),good.authorityCode(),good.authorizationReference(),NOW.plusMillis(1),good.originalRunMode(),good.taskManifestSha256(),good.closedInputSha256()),
            new ProductAuthorization(good.authorizationId(),good.authorityCode(),good.authorizationReference(),good.authorizedAt(),"STANDARD",good.taskManifestSha256(),good.closedInputSha256()),
            new ProductAuthorization(good.authorizationId(),good.authorityCode(),good.authorizationReference(),good.authorizedAt(),good.originalRunMode(),"d".repeat(64),good.closedInputSha256()),
            new ProductAuthorization(good.authorizationId(),good.authorityCode(),good.authorizationReference(),good.authorizedAt(),good.originalRunMode(),good.taskManifestSha256(),"d".repeat(64)),
            new ProductAuthorization("invalid",good.authorityCode(),good.authorizationReference(),good.authorizedAt(),good.originalRunMode(),good.taskManifestSha256(),good.closedInputSha256())
        ))assertInvalid(repin(original,copy(p,"REVIEW_PREVIEW",invalid)));
    }

    @Test void aQualifiedPriorPreviewCanBeComparedWithoutReclassifyingIt(){
        var original=comparison(3,true);var sources=new ArrayList<>(original.sources());var ba=sources.get(1);
        sources.set(1,new Source(ba.majorCode(),ba.studentPublicId(),copy(ba.pins(),"REVIEW_PREVIEW",proof(ba.pins())),ba.snapshot(),ba.items(),ba.experienceVersion()));
        var input=new ReportInput(original.header(),original.versions(),sources,original.nextRecommendation());
        var output=core.fallback(input,core.compile(input));
        assertEquals(21,output.publicReportJson().at("/sections/3/claims").size());
        assertEquals("REVIEW_PREVIEW",input.sources().get(1).pins().runMode());
    }

    private void assertInvalid(ReportInput input){assertEquals("REPORT_SOURCE_INVALID",assertThrows(ReportInputException.class,()->core.compile(input)).code);}
    private static ReportInput authorized(ReportInput original){var p=original.sources().getFirst().pins();return repin(original,copy(p,"REVIEW_PREVIEW",proof(p)));}
    private static ReportInput repin(ReportInput original,SourcePins pins){var s=original.sources().getFirst();return new ReportInput(original.header(),original.versions(),List.of(new Source(s.majorCode(),s.studentPublicId(),pins,s.snapshot(),s.items(),s.experienceVersion())),original.nextRecommendation());}
    private static ProductAuthorization proof(SourcePins p){return new ProductAuthorization(id(777),"PROJECT_OWNER_REQUEST","LOCAL_ACCEPTANCE_FIXTURE",NOW.minusSeconds(1),"REVIEW_PREVIEW",p.taskManifestSha256(),p.closedInputSha256());}
    private static SourcePins copy(SourcePins p,String mode,ProductAuthorization proof){return new SourcePins(p.runId(),mode,p.contentKind(),p.runStatus(),p.taskVersionId(),p.taskManifestSha256(),p.taskVersionCode(),p.taskTitle(),p.decisionProfileId(),p.profileSha256(),p.closedInputSha256(),p.questionSetVersion(),p.stepTitles(),proof);}
}
