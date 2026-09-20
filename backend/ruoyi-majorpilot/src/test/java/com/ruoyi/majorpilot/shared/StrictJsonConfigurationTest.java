package com.ruoyi.majorpilot.shared;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.analytics.PageEventService;
import com.ruoyi.majorpilot.auth.AuthDtos;
import com.ruoyi.majorpilot.intake.DecisionAnswers;
import com.ruoyi.majorpilot.intake.IntakeService;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import static org.junit.jupiter.api.Assertions.*;

class StrictJsonConfigurationTest {
    ObjectMapper mapper(){var builder=Jackson2ObjectMapperBuilder.json();new StrictJsonConfiguration().p1StrictJson().customize(builder);return builder.build();}
    @Test void durationRequiresRealJsonInteger()throws Exception {
        var mapper=mapper();assertEquals(1000L,mapper.readValue("{\"visibleDurationMs\":1000}",PageEventService.Observation.class).visibleDurationMs());
        for(String value:new String[]{"1000.5","1000.0","\"1000\"","true","\"\""})assertThrows(JsonProcessingException.class,()->mapper.readValue("{\"visibleDurationMs\":"+value+"}",PageEventService.Observation.class));
    }
    @Test void revisionsCannotBeTruncatedOrCoercedFromStrings()throws Exception {
        var mapper=mapper();assertEquals(2L,mapper.readValue("{\"expectedRevision\":2}",IntakeService.Submission.class).expectedRevision());
        for(String value:new String[]{"2.7","\"2\"","false"})assertThrows(JsonProcessingException.class,()->mapper.readValue("{\"expectedRevision\":"+value+"}",IntakeService.Submission.class));
    }
    @Test void enumOrdinalAndNullPrimitiveAreNotValidAliases()throws Exception {
        var mapper=mapper();assertEquals(DecisionAnswers.Major.AI,mapper.readValue("{\"majorCode\":\"AI\",\"rank\":1}",DecisionAnswers.ScenarioRank.class).majorCode());
        for(String json:new String[]{"{\"majorCode\":0,\"rank\":1}","{\"majorCode\":\"0\",\"rank\":1}","{\"majorCode\":true,\"rank\":1}","{\"majorCode\":\"AI\",\"rank\":null}"})assertThrows(JsonProcessingException.class,()->mapper.readValue(json,DecisionAnswers.ScenarioRank.class));
    }
    @Test void credentialsRequireJsonStrings()throws Exception {
        var mapper=mapper();assertEquals("synthetic passphrase",mapper.readValue("{\"email\":\"fixture@example.invalid\",\"password\":\"synthetic passphrase\"}",AuthDtos.Login.class).password());
        for(String value:new String[]{"123456789012345","true","12.5"})assertThrows(JsonProcessingException.class,()->mapper.readValue("{\"password\":"+value+"}",AuthDtos.Login.class));
    }
}
