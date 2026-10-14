package com.ruoyi.majorpilot.analytics;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.intake.IntakeService;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.acceptance.LocalProductAccess;
import com.ruoyi.majorpilot.acceptance.ProductEligibility;
import org.springframework.context.annotation.Profile;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Whitelisted page observations, never backend facts or client-supplied ownership/major/result fields. */
@Service @Profile({"local","pilot"})
public class PageEventService {
    public record Observation(String clientEventId,String eventName,String eventVersion,Instant occurredAt,String contextType,String contextPublicId,Long visibleDurationMs,JsonNode properties) {}
    public record Batch(List<Observation> events) {}
    public record Accepted(int acceptedCount,int duplicateCount) {}
    private record RunContext(long id,long taskId,String taskPublicId,String versionCode,String major,String kind,String mode,String step) {}
    private record Checked(Observation event,Long recommendation,String major,Long report,Long version,RunContext run) {}
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final IntakeService intakes;private final RateLimits limits;private final ProductEvents events;
    private final boolean demoEnabled,previewEnabled;private final Clock clock;
    @Autowired public PageEventService(JdbcTemplate jdbc,ObjectMapper mapper,IntakeService intakes,RateLimits limits,ProductEvents events,
            @Value("${MP_P2_DEMO_ENABLED:false}") boolean demoEnabled,@Value("${MP_CONTENT_PREVIEW_ENABLED:false}") boolean previewEnabled) {
        this(jdbc,mapper,intakes,limits,events,demoEnabled,previewEnabled,Clock.systemUTC());
    }
    public PageEventService(JdbcTemplate jdbc,ObjectMapper mapper,IntakeService intakes,RateLimits limits,ProductEvents events) {
        this(jdbc,mapper,intakes,limits,events,false,false,Clock.systemUTC());
    }
    PageEventService(JdbcTemplate jdbc,ObjectMapper mapper,IntakeService intakes,RateLimits limits,ProductEvents events,
            boolean demoEnabled,boolean previewEnabled,Clock clock) {
        this.jdbc=jdbc;this.mapper=mapper;this.intakes=intakes;this.limits=limits;this.events=events;
        this.demoEnabled=demoEnabled;this.previewEnabled=previewEnabled;this.clock=clock;
    }
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
        Instant now=clock.instant().truncatedTo(ChronoUnit.MILLIS);
        validate(batch,now,mapper);limits.require("events",subject,60,Duration.ofMinutes(1));
        List<Checked> checked=new ArrayList<>();
        // Validate every resource before any event insert so an invalid batch is atomic.
        for(Observation event:batch.events()) {
            if(event.contextType().equals("EXPERIENCE_RUN")) {
                if(student==null)throw invalid();
                RunContext run=runContext(student,event);
                checked.add(new Checked(event,null,run.major(),null,null,run));continue;
            }
            if(event.contextType().equals("REPORT_VERSION")){
                if(student==null)throw invalid();var reportRows=jdbc.queryForList("SELECT v.id,p.id AS report_id,p.report_type,m.code AS major_code FROM mp_report_version v JOIN mp_report p ON p.id=v.report_id LEFT JOIN mp_major m ON m.id=p.major_id WHERE v.public_id=? AND p.student_id=? AND v.status IN ('READY','SUPERSEDED')",event.contextPublicId(),student);
                if(reportRows.isEmpty())throw invalid();var row=reportRows.getFirst();if(event.eventName().equals("comparison_report.viewed")&&!"COMPARISON".equals(row.get("report_type"))||event.eventName().equals("report.viewed")&&!"EXPERIENCE".equals(row.get("report_type")))throw invalid();
                checked.add(new Checked(event,null,(String)row.get("major_code"),((Number)row.get("report_id")).longValue(),((Number)row.get("id")).longValue(),null));continue;
            }
            var rows=student!=null?jdbc.queryForList("SELECT id,primary_major_code FROM mp_recommendation WHERE public_id=? AND student_id=?",event.contextPublicId(),student):jdbc.queryForList("SELECT r.id,r.primary_major_code FROM mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE r.public_id=? AND p.intake_session_id=? AND r.student_id IS NULL",event.contextPublicId(),intake);
            if(rows.isEmpty())throw new ApiException(422,"EVENT_BATCH_INVALID");
            String type=jdbc.queryForObject("SELECT recommendation_type FROM mp_recommendation WHERE id=?",String.class,rows.getFirst().get("id"));if(event.eventName().equals("next_recommendation.viewed")?!type.equals("NEXT")||student==null:!type.equals("INITIAL"))throw invalid();
            checked.add(new Checked(event,((Number)rows.getFirst().get("id")).longValue(),(String)rows.getFirst().get("primary_major_code"),null,null,null));
        }
        int accepted=0;String hash=Secrets.hash(subject);
        for(Checked value:checked) {
            Observation event=value.event();RunContext run=value.run();String storedName=storedName(value);
            boolean resume=event.eventName().equals("experience.run.resumed");
            // Student FOR UPDATE serializes concurrent batches; the clock is reception, not client time.
            if(resume) {
                var previous=jdbc.queryForList("SELECT received_at FROM mp_product_event WHERE student_id=? AND experience_run_id=? AND event_name=? AND source='STUDENT_WEB' ORDER BY received_at DESC,id DESC LIMIT 1",student,run.id(),storedName);
                if(!previous.isEmpty()&&resumeCoolingDown(now,DbTimes.instant(previous.getFirst().get("received_at"))))continue;
            }
            String context=event.contextPublicId()+(run==null?"":"\0"+run.taskPublicId()+"\0"+run.step());
            String dedupe=resume?null:Secrets.hash(subject+"\0"+event.eventName()+"\0"+context);
            try {
                Map<String,Object> properties=properties(value);
                accepted+=jdbc.update("INSERT INTO mp_product_event(event_id,client_event_id,source_subject_hash,event_name,event_version,source,occurred_at,received_at,student_id,intake_session_id,recommendation_id,report_id,report_version_id,experience_run_id,task_version_id,major_code,step_key,run_mode,properties_json,dedupe_key) VALUES(?,?,?,?,'v1','STUDENT_WEB',?,?,?,?,?,?,?,?,?,?,?,?,?,?)",PublicIds.next(),event.clientEventId(),hash,storedName,Timestamp.from(event.occurredAt()),Timestamp.from(now),student,intake,value.recommendation(),value.report(),value.version(),run==null?null:run.id(),run==null?null:run.taskId(),value.major(),run==null?null:run.step(),run==null?null:run.mode(),events.json(properties),dedupe);
            } catch(DuplicateKeyException duplicate) { /* Valid repeated observations are not counted twice. */ }
        }
        return new Accepted(accepted,checked.size()-accepted);
    }
    private Map<String,Object> properties(Checked checked){
        var event=checked.event();Map<String,Object> values=new java.util.LinkedHashMap<>();
        if(checked.run()!=null) {
            var run=checked.run();values.put("stepKey",run.step());values.put("taskVersion",run.taskPublicId());
            values.put("taskVersionCode",run.versionCode());values.put("contentKind",run.kind());values.put("runMode",run.mode());
            if(run.major()!=null)values.put("majorCode",run.major());
            if(event.eventName().equals("experience.run.resumed"))values.put("inactivityBucket",event.properties().path("inactivityBucket").asText());
            return values;
        }
        if(event.eventName().equals("recommendation.viewed")){values.put("primaryMajor",checked.major());return values;}
        if(event.eventName().equals("next_recommendation.viewed")){var row=jdbc.queryForMap("SELECT m.code FROM mp_recommendation n JOIN mp_experience_run r ON r.id=n.source_run_id JOIN mp_major m ON m.id=r.major_id WHERE n.id=?",checked.recommendation());values.put("completedMajor",row.get("code"));values.put("recommendedMajor",checked.major());return values;}
        if(event.eventName().equals("comparison_report.viewed")){values.put("majorSet",jdbc.queryForList("SELECT m.code FROM mp_comparison_source x JOIN mp_major m ON m.id=x.major_id WHERE x.comparison_report_version_id=? ORDER BY m.code",String.class,checked.version()));return values;}
        var row=jdbc.queryForMap("SELECT r.report_type,v.generation_mode FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE v.id=?",checked.version());values.put("reportType",row.get("report_type"));values.put("reportVersion",event.contextPublicId());if(event.eventName().equals("report.viewed"))values.put("fallbackUsed","DETERMINISTIC_FALLBACK".equals(row.get("generation_mode")));return values;
    }
    public static void validate(Batch batch,Instant now,ObjectMapper mapper) {
        if(batch==null||batch.events()==null||batch.events().isEmpty()||batch.events().size()>20)throw invalid();
        try{if(mapper.writeValueAsBytes(batch).length>16384)throw invalid();}catch(ApiException invalid){throw invalid;}catch(Exception invalid){throw invalid();}
        for(Observation event:batch.events()) {
            if(event==null||event.eventName()==null||!Set.of("recommendation.viewed","next_recommendation.viewed","report.viewed","report.printed","comparison_report.viewed","experience.step.viewed","experience.run.resumed").contains(event.eventName())||!"v1".equals(event.eventVersion())||!contextType(event.eventName()).equals(event.contextType())||event.contextPublicId()==null||!event.contextPublicId().matches("[0-7][0-9A-HJKMNP-TV-Z]{25}"))throw invalid();
            try{if(event.clientEventId()==null||!UUID.fromString(event.clientEventId()).toString().equals(event.clientEventId()))throw invalid();}catch(IllegalArgumentException bad){throw invalid();}
            if(event.occurredAt()==null||event.occurredAt().isAfter(now.plusSeconds(300))||event.occurredAt().isBefore(now.minusSeconds(86400)))throw invalid();
            // A client-reported observation, not proof of attention or a backend business fact.
            if(event.visibleDurationMs()==null||event.visibleDurationMs()<1000||event.visibleDurationMs()>86400000)throw invalid();
            validateProperties(event);
        }
    }
    private static String contextType(String name) { return name.startsWith("experience.")?"EXPERIENCE_RUN":name.contains("recommendation")?"RECOMMENDATION":"REPORT_VERSION"; }
    private static void validateProperties(Observation event) {
        JsonNode p=event.properties();
        if(!event.eventName().startsWith("experience.")) {if(p!=null&&(!p.isObject()||!p.isEmpty()))throw invalid();return;}
        boolean resume=event.eventName().equals("experience.run.resumed");
        if(p==null||!p.isObject()||p.size()!=(resume?2:1)||!p.path("stepKey").isTextual()
            ||!p.path("stepKey").asText().matches("[a-z][a-z0-9-]{0,39}"))throw invalid();
        if(resume&&(!p.path("inactivityBucket").isTextual()||!Set.of("MINUTES_10_60","HOURS_1_24","DAYS_1_PLUS").contains(p.path("inactivityBucket").asText())))throw invalid();
    }
    static boolean resumeCoolingDown(Instant now,Instant previous) {return previous!=null&&previous.isAfter(now.minusSeconds(600));}
    private static String storedName(Checked value) {
        RunContext run=value.run();return run==null?value.event().eventName():
            (run.kind().equals("DEMO")?"demo.":run.mode().equals("REVIEW_PREVIEW")?"preview.":"")+value.event().eventName();
    }
    private RunContext runContext(long student,Observation event) {
        var rows=jdbc.queryForList("SELECT r.id,r.content_kind,r.run_mode,r.status,r.started_at,r.task_version_id,r.major_id,r.demo_key,t.content_kind AS task_kind,t.major_id AS task_major_id,t.demo_key AS task_demo_key,t.public_id AS task_public_id,t.version_code,t.status AS task_status,t.manifest_json,m.code AS major_code FROM mp_experience_run r JOIN mp_task_version t ON t.id=r.task_version_id LEFT JOIN mp_major m ON m.id=r.major_id WHERE r.public_id=? AND r.student_id=?",event.contextPublicId(),student);
        if(rows.isEmpty())throw invalid();var row=rows.getFirst();String kind=(String)row.get("content_kind"),mode=(String)row.get("run_mode");
        if(!java.util.Objects.equals(kind,row.get("task_kind"))||!java.util.Objects.equals(row.get("major_id"),row.get("task_major_id"))
            ||!java.util.Objects.equals(row.get("demo_key"),row.get("task_demo_key")))throw invalid();
        long id=((Number)row.get("id")).longValue();
        if(row.get("started_at")==null||DbTimes.instant(row.get("started_at")).isAfter(clock.instant())||!Set.of("IN_PROGRESS","TASK_COMPLETED","PAUSED","CLOSED","REPLACED").contains(row.get("status"))
            ||kind.equals("DEMO")&&!demoEnabled||mode.equals("REVIEW_PREVIEW")&&!previewEnabled&&!ProductEligibility.eligible(jdbc,student,id))throw invalid();
        Set<String> readable=mode.equals("REVIEW_PREVIEW")?Set.of("REVIEW","PUBLISHED","RETIRED"):Set.of("PUBLISHED","RETIRED");
        if(!readable.contains(row.get("task_status"))&&!(kind.equals("MAJOR")&&"REVIEW".equals(row.get("task_status"))&&jdbc.queryForObject("SELECT COUNT(*) FROM mp_task_version t WHERE t.id=? AND "+LocalProductAccess.pinnedSql("t"),Integer.class,row.get("task_version_id"))==1))throw invalid();
        String step=event.properties().path("stepKey").asText();
        JsonNode manifest;try{manifest=mapper.readTree(row.get("manifest_json").toString());}catch(Exception corrupt){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
        JsonNode definition=null;for(JsonNode candidate:manifest.path("steps"))if(step.equals(candidate.path("stepKey").asText()))definition=candidate;
        if(definition==null||!manifest.path("taskVersionId").asText().equals(row.get("task_public_id")))throw invalid();
        var states=jdbc.queryForList("SELECT step_key,status FROM mp_step_state WHERE experience_run_id=?",id);
        Map<String,String> byKey=new java.util.HashMap<>();for(var state:states)byKey.put((String)state.get("step_key"),(String)state.get("status"));
        if(!byKey.containsKey(step))throw invalid();
        for(JsonNode dependency:definition.path("dependencies"))if(!"COMPLETED".equals(byKey.get(dependency.asText())))throw invalid();
        return new RunContext(id,((Number)row.get("task_version_id")).longValue(),(String)row.get("task_public_id"),(String)row.get("version_code"),(String)row.get("major_code"),kind,mode,step);
    }
    private static ApiException invalid() { return new ApiException(422,"EVENT_BATCH_INVALID"); }
}
