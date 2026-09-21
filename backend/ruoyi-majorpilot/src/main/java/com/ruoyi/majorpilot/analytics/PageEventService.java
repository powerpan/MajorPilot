package com.ruoyi.majorpilot.analytics;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.intake.IntakeService;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** P1 accepts only recommendation display observations, never backend facts or supplied major/result fields. */
@Service @Profile("local")
public class PageEventService {
    public record Observation(String clientEventId,String eventName,String eventVersion,Instant occurredAt,String contextType,String contextPublicId,Long visibleDurationMs,JsonNode properties) {}
    public record Batch(List<Observation> events) {}
    public record Accepted(int acceptedCount,int duplicateCount) {}
    private record Checked(Observation event,Long recommendation,String major,Long report,Long version) {}
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final IntakeService intakes;private final RateLimits limits;private final ProductEvents events;
    public PageEventService(JdbcTemplate jdbc,ObjectMapper mapper,IntakeService intakes,RateLimits limits,ProductEvents events) { this.jdbc=jdbc;this.mapper=mapper;this.intakes=intakes;this.limits=limits;this.events=events; }
    @Transactional public Accepted intake(String secretHash,Batch batch) {
        // The cookie establishes scope; a body-supplied intake/student ID is never accepted.
        var rows=jdbc.queryForList("SELECT public_id FROM mp_intake_session WHERE secret_hash=?",secretHash);
        if(rows.isEmpty())throw new ApiException(401,"AUTH_REQUIRED");
        long intake=intakes.authenticateForEvent((String)rows.getFirst().get("public_id"),secretHash);
        Accepted accepted=accept(null,intake,"intake:"+intake,batch);intakes.touchForEvent(intake);return accepted;
    }
    @Transactional public Accepted student(StudentPrincipal student,Batch batch) {
        var rows=jdbc.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student.internalId());
        if(rows.isEmpty()||!"ACTIVE".equals(rows.getFirst().get("status")))throw new ApiException(403,"EMAIL_NOT_VERIFIED");
        return accept(student.internalId(),null,"student:"+student.internalId(),batch);
    }
    private Accepted accept(Long student,Long intake,String subject,Batch batch) {
        validate(batch,Instant.now(),mapper);limits.require("events",subject,60,Duration.ofMinutes(1));
        List<Checked> checked=new ArrayList<>();
        // Validate every resource before any event insert so an invalid batch is atomic.
        for(Observation event:batch.events()) {
            if(event.contextType().equals("REPORT_VERSION")){
                if(student==null)throw invalid();var reportRows=jdbc.queryForList("SELECT v.id,p.id AS report_id,p.report_type,m.code AS major_code FROM mp_report_version v JOIN mp_report p ON p.id=v.report_id LEFT JOIN mp_major m ON m.id=p.major_id WHERE v.public_id=? AND p.student_id=? AND v.status IN ('READY','SUPERSEDED')",event.contextPublicId(),student);
                if(reportRows.isEmpty())throw invalid();var row=reportRows.getFirst();if(event.eventName().equals("comparison_report.viewed")&&!"COMPARISON".equals(row.get("report_type"))||event.eventName().equals("report.viewed")&&!"EXPERIENCE".equals(row.get("report_type")))throw invalid();
                checked.add(new Checked(event,null,(String)row.get("major_code"),((Number)row.get("report_id")).longValue(),((Number)row.get("id")).longValue()));continue;
            }
            var rows=student!=null?jdbc.queryForList("SELECT id,primary_major_code FROM mp_recommendation WHERE public_id=? AND student_id=?",event.contextPublicId(),student):jdbc.queryForList("SELECT r.id,r.primary_major_code FROM mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE r.public_id=? AND p.intake_session_id=? AND r.student_id IS NULL",event.contextPublicId(),intake);
            if(rows.isEmpty())throw new ApiException(422,"EVENT_BATCH_INVALID");
            String type=jdbc.queryForObject("SELECT recommendation_type FROM mp_recommendation WHERE id=?",String.class,rows.getFirst().get("id"));if(event.eventName().equals("next_recommendation.viewed")?!type.equals("NEXT")||student==null:!type.equals("INITIAL"))throw invalid();
            checked.add(new Checked(event,((Number)rows.getFirst().get("id")).longValue(),(String)rows.getFirst().get("primary_major_code"),null,null));
        }
        int accepted=0;String hash=Secrets.hash(subject);Instant now=Instant.now();
        for(Checked value:checked) {
            Observation event=value.event();String dedupe=Secrets.hash(subject+"\0"+event.eventName()+"\0"+event.contextPublicId());
            try {
                Map<String,Object> properties=properties(value);
                accepted+=jdbc.update("INSERT INTO mp_product_event(event_id,client_event_id,source_subject_hash,event_name,event_version,source,occurred_at,received_at,student_id,intake_session_id,recommendation_id,report_id,report_version_id,properties_json,dedupe_key) VALUES(?,?,?,?,'v1','STUDENT_WEB',?,?,?,?,?,?,?,?,?)",PublicIds.next(),event.clientEventId(),hash,event.eventName(),Timestamp.from(event.occurredAt()),Timestamp.from(now),student,intake,value.recommendation(),value.report(),value.version(),events.json(properties),dedupe);
            } catch(DuplicateKeyException duplicate) { /* Valid repeated observations are not counted twice. */ }
        }
        return new Accepted(accepted,checked.size()-accepted);
    }
    private Map<String,Object> properties(Checked checked){
        var event=checked.event();Map<String,Object> values=new java.util.LinkedHashMap<>();
        if(event.eventName().equals("recommendation.viewed")){values.put("primaryMajor",checked.major());return values;}
        if(event.eventName().equals("next_recommendation.viewed")){var row=jdbc.queryForMap("SELECT m.code FROM mp_recommendation n JOIN mp_experience_run r ON r.id=n.source_run_id JOIN mp_major m ON m.id=r.major_id WHERE n.id=?",checked.recommendation());values.put("completedMajor",row.get("code"));values.put("recommendedMajor",checked.major());return values;}
        if(event.eventName().equals("comparison_report.viewed")){values.put("majorSet",jdbc.queryForList("SELECT m.code FROM mp_comparison_source x JOIN mp_major m ON m.id=x.major_id WHERE x.comparison_report_version_id=? ORDER BY m.code",String.class,checked.version()));return values;}
        var row=jdbc.queryForMap("SELECT r.report_type,v.generation_mode FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE v.id=?",checked.version());values.put("reportType",row.get("report_type"));values.put("reportVersion",event.contextPublicId());if(event.eventName().equals("report.viewed"))values.put("fallbackUsed","DETERMINISTIC_FALLBACK".equals(row.get("generation_mode")));return values;
    }
    public static void validate(Batch batch,Instant now,ObjectMapper mapper) {
        if(batch==null||batch.events()==null||batch.events().isEmpty()||batch.events().size()>20)throw invalid();
        try{if(mapper.writeValueAsBytes(batch).length>16384)throw invalid();}catch(ApiException invalid){throw invalid;}catch(Exception invalid){throw invalid();}
        for(Observation event:batch.events()) {
            if(event==null||event.eventName()==null||!java.util.Set.of("recommendation.viewed","next_recommendation.viewed","report.viewed","report.printed","comparison_report.viewed").contains(event.eventName())||!"v1".equals(event.eventVersion())||!(event.eventName().contains("recommendation")?"RECOMMENDATION":"REPORT_VERSION").equals(event.contextType())||event.contextPublicId()==null||!event.contextPublicId().matches("[0-7][0-9A-HJKMNP-TV-Z]{25}"))throw invalid();
            try{if(event.clientEventId()==null||!UUID.fromString(event.clientEventId()).toString().equals(event.clientEventId()))throw invalid();}catch(IllegalArgumentException bad){throw invalid();}
            if(event.occurredAt()==null||event.occurredAt().isAfter(now.plusSeconds(300))||event.occurredAt().isBefore(now.minusSeconds(86400)))throw invalid();
            // A client-reported observation, not proof of attention or a backend business fact.
            if(event.visibleDurationMs()==null||event.visibleDurationMs()<1000||event.visibleDurationMs()>86400000)throw invalid();
            if(event.properties()!=null&&(!event.properties().isObject()||!event.properties().isEmpty()))throw invalid();
        }
    }
    private static ApiException invalid() { return new ApiException(422,"EVENT_BATCH_INVALID"); }
}
