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
}
