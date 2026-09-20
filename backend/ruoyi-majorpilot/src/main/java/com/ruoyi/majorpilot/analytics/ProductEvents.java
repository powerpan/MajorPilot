package com.ruoyi.majorpilot.analytics;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.Map;
import java.util.Set;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.shared.PublicIds;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Domain facts are recorded only by backend transactions; answers and credentials never enter events. */
@Service @Profile("local")
public class ProductEvents {
    private static final Map<String,Set<String>> ALLOWED = Map.of(
        "intake.session.started",Set.of("questionnaireVersion"),
        "intake.step.saved",Set.of("stepKey","revision"),
        "intake.profile.submitted",Set.of("questionnaireVersion","requiredAnswerCount"),
        "student.registration.completed",Set.of("acquisitionChannelCode","questionnaireVersion"),
        "student.email.verified",Set.of("elapsedBucket"),
        "recommendation.generated",Set.of("ruleVersion","primaryMajor","tieDetected","explanationStatus"),
        "recommendation.decision.made",Set.of("decisionType","recommendedMajor","selectedMajor","reasonCode"),
        "recommendation.viewed",Set.of("primaryMajor"));
    private final JdbcTemplate jdbc; private final ObjectMapper mapper;
    public ProductEvents(JdbcTemplate jdbc,ObjectMapper mapper) { this.jdbc=jdbc;this.mapper=mapper; }
    public void record(Long student,Long intake,Long recommendation,String event,Map<String,?> properties) {
        if(!ALLOWED.containsKey(event)||!ALLOWED.get(event).containsAll(properties.keySet())) throw new IllegalArgumentException("Event properties not permitted");
        Instant now=Instant.now();
        jdbc.update("INSERT INTO mp_product_event(event_id,event_name,event_version,source,occurred_at,received_at,student_id,intake_session_id,recommendation_id,properties_json) VALUES(?,?,'v1','BACKEND',?,?,?,?,?,?)",PublicIds.next(),event,Timestamp.from(now),Timestamp.from(now),student,intake,recommendation,json(properties));
    }
    public String json(Object value) { try { return mapper.writeValueAsString(value); } catch(Exception invalid) { throw new IllegalStateException("Event serialization failed"); } }
}
