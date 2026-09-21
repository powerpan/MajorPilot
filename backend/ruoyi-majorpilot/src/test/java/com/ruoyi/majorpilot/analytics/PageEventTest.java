package com.ruoyi.majorpilot.analytics;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import com.ruoyi.majorpilot.intake.IntakeFixtures;
import com.ruoyi.majorpilot.shared.ApiException;
import com.ruoyi.majorpilot.shared.PublicIds;
import org.junit.jupiter.api.Test;

class PageEventTest {
    private final Instant now=Instant.parse("2026-09-20T00:00:00Z");
    private PageEventService.Observation valid() { return new PageEventService.Observation(UUID.randomUUID().toString(),"recommendation.viewed","v1",now,"RECOMMENDATION",PublicIds.next(),1000L,IntakeFixtures.JSON.createObjectNode()); }
    @Test void validDisplayObservationHasNoClientMajorOrActorFields() { assertDoesNotThrow(()->PageEventService.validate(new PageEventService.Batch(List.of(valid())),now,IntakeFixtures.JSON)); }
    @Test void rejectsBackendFactsUnrecognizedPropertiesAndTimes() {
        var good=valid();for(var bad:List.of(
            new PageEventService.Observation(good.clientEventId(),"recommendation.generated","v1",now,good.contextType(),good.contextPublicId(),1000L,good.properties()),
            new PageEventService.Observation(good.clientEventId(),good.eventName(),"v1",now,good.contextType(),good.contextPublicId(),1000L,IntakeFixtures.JSON.createObjectNode().put("primaryMajor","AI")),
            new PageEventService.Observation(good.clientEventId(),good.eventName(),"v1",now.plusSeconds(301),good.contextType(),good.contextPublicId(),1000L,good.properties()),
            new PageEventService.Observation(good.clientEventId(),good.eventName(),"v1",now.minusSeconds(86401),good.contextType(),good.contextPublicId(),1000L,good.properties()))) {
            assertThrows(ApiException.class,()->PageEventService.validate(new PageEventService.Batch(List.of(good,bad)),now,IntakeFixtures.JSON));
        }
    }
    @Test void rejectsNullEmptyOrOverTwentyObservations() {
        assertThrows(ApiException.class,()->PageEventService.validate(null,now,IntakeFixtures.JSON));assertThrows(ApiException.class,()->PageEventService.validate(new PageEventService.Batch(List.of()),now,IntakeFixtures.JSON));assertThrows(ApiException.class,()->PageEventService.validate(new PageEventService.Batch(java.util.Collections.nCopies(21,valid())),now,IntakeFixtures.JSON));
    }
    @Test void displayObservationRequiresAtLeastOneSecondAndBoundedDuration() {
        var good=valid();
        for(Long duration:java.util.Arrays.asList(null,0L,999L,86400001L)) {
            var bad=new PageEventService.Observation(good.clientEventId(),good.eventName(),good.eventVersion(),good.occurredAt(),good.contextType(),good.contextPublicId(),duration,good.properties());
            assertThrows(ApiException.class,()->PageEventService.validate(new PageEventService.Batch(List.of(bad)),now,IntakeFixtures.JSON));
        }
    }
    private PageEventService.Observation run(String name,com.fasterxml.jackson.databind.JsonNode properties) {
        return new PageEventService.Observation(UUID.randomUUID().toString(),name,"v1",now,"EXPERIENCE_RUN",PublicIds.next(),1000L,properties);
    }
    @Test void runObservationAcceptsOnlyThePreciseStepAndInactivityShape() {
        var step=IntakeFixtures.JSON.createObjectNode().put("stepKey","a1-context");
        assertDoesNotThrow(()->PageEventService.validate(new PageEventService.Batch(List.of(run("experience.step.viewed",step))),now,IntakeFixtures.JSON));
        for(String bucket:List.of("MINUTES_10_60","HOURS_1_24","DAYS_1_PLUS")) {
            var p=step.deepCopy().put("inactivityBucket",bucket);
            assertDoesNotThrow(()->PageEventService.validate(new PageEventService.Batch(List.of(run("experience.run.resumed",p))),now,IntakeFixtures.JSON));
        }
    }
    @Test void runObservationRejectsOwnershipFactsExtraPropertiesAndUnrecognizedStepsOrBuckets() {
        var step=IntakeFixtures.JSON.createObjectNode().put("stepKey","a1-context");
        for(var p:List.of(step.deepCopy().put("majorCode","AI"),step.deepCopy().put("studentId",1),
            step.deepCopy().put("taskVersion","spoof"),step.deepCopy().put("stepKey","../private"),
            step.deepCopy().put("stepKey",1),IntakeFixtures.JSON.createObjectNode())) {
            assertThrows(ApiException.class,()->PageEventService.validate(new PageEventService.Batch(List.of(run("experience.step.viewed",p))),now,IntakeFixtures.JSON));
        }
        for(var p:List.of(step,step.deepCopy().put("inactivityBucket","MINUTES_0_10"),
            step.deepCopy().put("inactivityBucket",600),step.deepCopy().put("inactivityBucket","DAYS_1_PLUS").put("reason","free text"))) {
            assertThrows(ApiException.class,()->PageEventService.validate(new PageEventService.Batch(List.of(run("experience.run.resumed",p))),now,IntakeFixtures.JSON));
        }
        assertThrows(ApiException.class,()->PageEventService.validate(new PageEventService.Batch(List.of(run("experience.run.started",step))),now,IntakeFixtures.JSON));
    }
    @Test void runResumeCooldownUsesReceptionTimeAndAllowsExactTenMinuteBoundary() {
        assertTrue(PageEventService.resumeCoolingDown(now,now.minusMillis(599999)));
        assertFalse(PageEventService.resumeCoolingDown(now,now.minusSeconds(600)));
        assertFalse(PageEventService.resumeCoolingDown(now,null));
        assertTrue(PageEventService.resumeCoolingDown(now,now.plusSeconds(1)));
    }
}
