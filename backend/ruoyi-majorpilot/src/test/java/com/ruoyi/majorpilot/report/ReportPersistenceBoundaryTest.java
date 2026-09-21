package com.ruoyi.majorpilot.report;
import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.shared.*;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import static org.junit.jupiter.api.Assertions.*;
class ReportPersistenceBoundaryTest {
    @Test void productionCustomizerPinsIsoInstantsAndCanonicalHashSurvivesJsonParsing()throws Exception{
        var builder=new Jackson2ObjectMapperBuilder();new StrictJsonConfiguration().p1StrictJson().customize(builder);ObjectMapper mapper=builder.build();
        var source=mapper.valueToTree(Map.of("observedAt",Instant.parse("2026-09-21T01:02:03.123Z"),"body",mapper.readTree("{\"b\":null,\"a\":1.25,\"z\":[3,2,1]}")));
        assertEquals("2026-09-21T01:02:03.123Z",source.path("observedAt").asText());
        var reordered=mapper.readTree("{\"body\":{\"z\":[3,2,1],\"a\":1.25,\"b\":null},\"observedAt\":\"2026-09-21T01:02:03.123Z\"}");assertEquals(CanonicalJson.hash(mapper,source),CanonicalJson.hash(mapper,reordered));
        assertNotEquals(CanonicalJson.hash(mapper,mapper.readTree("{\"n\":1}")),CanonicalJson.hash(mapper,mapper.readTree("{\"n\":\"1\"}")));assertNotEquals(CanonicalJson.hash(mapper,mapper.readTree("{\"n\":null}")),CanonicalJson.hash(mapper,mapper.readTree("{}")));
    }
    @Test void feedbackHasStrictSurveyEnumsAndCannotAcceptArbitraryDiagnosticPayload(){
        var mapper=new ObjectMapper();assertThrows(ApiException.class,()->FeedbackService.validate(new ReportDtos.Feedback("REPORT","REPORT_VERSION",PublicIds.next(),null,null,"report-value-v1",mapper.createObjectNode().put("insightResponse",1.5),null)));
        assertThrows(ApiException.class,()->FeedbackService.validate(new ReportDtos.Feedback("TECHNICAL",null,null,null,"description",null,null,"raw console stack and token")));
        assertThrows(ApiException.class,()->FeedbackService.validate(new ReportDtos.Feedback("REPORT",null,null,5,null,null,null,null)));
    }
}
