package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.NullNode;
import com.ruoyi.majorpilot.shared.*;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository @Profile("local")
public class RunStore {
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final boolean demoEnabled;private final boolean previewEnabled;
    static final String SELECT="SELECT r.*,m.code AS major_code,t.public_id AS task_public_id FROM mp_experience_run r LEFT JOIN mp_major m ON m.id=r.major_id LEFT JOIN mp_task_version t ON t.id=r.task_version_id";
    @Autowired public RunStore(JdbcTemplate jdbc,ObjectMapper mapper,@Value("${MP_P2_DEMO_ENABLED:false}") boolean demoEnabled,@Value("${MP_CONTENT_PREVIEW_ENABLED:false}") boolean previewEnabled) { this.jdbc=jdbc;this.mapper=mapper;this.demoEnabled=demoEnabled;this.previewEnabled=previewEnabled; }
    public RunStore(JdbcTemplate jdbc,ObjectMapper mapper,boolean demoEnabled){this(jdbc,mapper,demoEnabled,false);}
    // Repository beans may be class-proxied; callers must use virtual methods, never fields.
    public JdbcTemplate jdbc() {return jdbc;}
    public ObjectMapper mapper() {return mapper;}
    public boolean demoEnabled() {return demoEnabled;}
    public boolean previewEnabled() {return previewEnabled;}
    record Row(long id,String publicId,long studentId,String kind,String mode,Long majorId,String majorCode,String demoKey,Long taskId,String taskPublicId,
               Long recommendationId,Long decisionId,Long profileId,String status,String pausedFrom,long revision,String currentStep,int attempt,Long origin,
               Instant started,Instant closed) {}
    Row row(Map<String,Object> m) { return new Row(n(m,"id"),s(m,"public_id"),n(m,"student_id"),s(m,"content_kind"),s(m,"run_mode"),nullable(m,"major_id"),s(m,"major_code"),s(m,"demo_key"),nullable(m,"task_version_id"),s(m,"task_public_id"),nullable(m,"source_recommendation_id"),nullable(m,"source_decision_id"),nullable(m,"decision_profile_id"),s(m,"status"),s(m,"paused_from_status"),n(m,"row_version"),s(m,"current_step_key"),(int)n(m,"attempt_no"),nullable(m,"origin_run_id"),time(m,"started_at"),time(m,"closed_at")); }
    Row owned(StudentPrincipal student,String id) {
        if(id==null||!id.matches("[0-9A-HJKMNP-TV-Z]{26}"))throw new ApiException(404,"RESOURCE_NOT_FOUND");
        var rows=jdbc.queryForList(SELECT+" WHERE r.public_id=? AND r.student_id=?",id,student.internalId());
        if(rows.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");Row run=row(rows.getFirst());demoGate(run);return run;
    }
    Row internal(long id) { var rows=jdbc.queryForList(SELECT+" WHERE r.id=?",id);if(rows.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");return row(rows.getFirst()); }
    void demoGate(Row run) { if(run.kind.equals("DEMO")&&!demoEnabled||run.mode.equals("REVIEW_PREVIEW")&&!previewEnabled)throw new ApiException(404,"RESOURCE_NOT_FOUND"); }
    void activeStudent(StudentPrincipal student) {
        var rows=jdbc.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student.internalId());
        if(rows.isEmpty())throw new ApiException(401,"AUTH_REQUIRED");String status=s(rows.getFirst(),"status");
        if(!status.equals("ACTIVE"))throw new ApiException(403,status.equals("PENDING_VERIFICATION")?"EMAIL_NOT_VERIFIED":"ACCOUNT_LOCKED");
    }
    void revision(Row run,Long expected) { expected(expected);if(run.revision!=expected)throw new ApiException(409,"RUN_REVISION_CONFLICT",Map.of("currentRevision",run.revision)); }
    static void expected(Long value) { if(value==null||value<0)throw new ApiException(422,"VALIDATION_ERROR"); }
    static void writable(Row run,String expected) {
        if(run.status.equals("PAUSED"))throw new ApiException(409,"RUN_PAUSED");
        if(run.status.equals("REPLACED"))throw new ApiException(409,"RUN_REPLACED");
        if(!run.status.equals(expected))throw new ApiException(409,"RUN_STATE_INVALID");
    }
    Row activeRun(long student) { var rows=jdbc.queryForList(SELECT+" WHERE r.student_id=? AND r.status IN ('IN_PROGRESS','TASK_COMPLETED')",student);return rows.isEmpty()?null:row(rows.getFirst()); }
    RunDtos.Run view(Row run) {
        var active=activeRun(run.studentId);var replacement=jdbc.queryForList("SELECT public_id FROM mp_experience_run WHERE origin_run_id=? ORDER BY attempt_no LIMIT 1",run.id);
        var steps=jdbc.queryForList("SELECT step_key,status,current_revision FROM mp_step_state WHERE experience_run_id=? ORDER BY id",run.id).stream().map(x->new RunDtos.StepSummary(s(x,"step_key"),s(x,"status"),n(x,"current_revision"))).toList();
        var reports=run.kind.equals("MAJOR")&&run.mode.equals("STANDARD")?jdbc.queryForList("SELECT status FROM mp_report WHERE experience_run_id=?",run.id):List.<Map<String,Object>>of();
        String report=run.kind.equals("DEMO")||run.mode.equals("REVIEW_PREVIEW")?"NOT_APPLICABLE":reports.isEmpty()?"NOT_REQUESTED":s(reports.getFirst(),"status");
        return new RunDtos.Run(run.publicId,run.kind,run.majorCode,run.demoKey,run.status,run.revision,run.taskPublicId,run.currentStep,run.pausedFrom,active==null?null:active.publicId,replacement.isEmpty()?null:s(replacement.getFirst(),"public_id"),!Set.of("IN_PROGRESS","TASK_COMPLETED").contains(run.status),steps,run.started,run.closed,report,run.mode);
    }
    String json(Object object) { try{return mapper.writeValueAsString(object);}catch(Exception failure){throw new ApiException(422,"VALIDATION_ERROR");} }
    JsonNode node(Object value) { if(value==null)return NullNode.instance;try{return mapper.readTree(value.toString());}catch(Exception failure){throw new IllegalStateException("Invalid stored content");} }
    String hash(JsonNode value){return CanonicalJson.hash(mapper,value);}
    static long n(Map<String,Object> row,String key) { return ((Number)row.get(key)).longValue(); }
    static Long nullable(Map<String,Object> row,String key) { return row.get(key)==null?null:n(row,key); }
    static String s(Map<String,Object> row,String key) { return (String)row.get(key); }
    static Instant time(Map<String,Object> row,String key) { return row.get(key)==null?null:DbTimes.instant(row.get(key)); }
    void touch(Row run,String currentStep) { jdbc.update("UPDATE mp_experience_run SET current_step_key=?,last_activity_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",currentStep,run.id); }
    void event(Row run,String suffix,Map<String,?> properties) {
        Set<String> allowed=switch(suffix) {
            case "run.created" -> Set.of("contentKind");case "run.started" -> Set.of("taskVersion");
            case "run.paused" -> Set.of("pausedFromStatus","stepKey");case "run.reactivated" -> Set.of("resumedStatus","stepKey");
            case "run.replaced" -> Set.of("reasonCode");case "response.saved" -> Set.of("stepKey","revision","responseType");
            case "step.completed" -> Set.of("stepKey");case "execution.completed" -> Set.of("operationKey","status","durationBucket","errorCode");
            case "hint.requested" -> Set.of("stepKey","hintLevel");case "hint.completed" -> Set.of("stepKey","hintLevel","status");
            case "task.completed" -> Set.of();case "reflection.submitted" -> Set.of("answeredCount","optionalSkippedCount");case "run.closed" -> Set.of("hintLevelMax");
            default -> throw new IllegalArgumentException("Undeclared run event");
        };
        if(!allowed.containsAll(properties.keySet()))throw new IllegalArgumentException("Undeclared run properties");
        String name=(run.kind.equals("DEMO")?"demo.":run.mode.equals("REVIEW_PREVIEW")?"preview.":"")+"experience."+suffix;Instant now=Instant.now();
        jdbc.update("INSERT INTO mp_product_event(event_id,event_name,event_version,source,occurred_at,received_at,student_id,experience_run_id,task_version_id,major_code,step_key,properties_json,run_mode) VALUES(?,?,'v1','BACKEND',?,?,?,?,?,?,?,?,?)",PublicIds.next(),name,Timestamp.from(now),Timestamp.from(now),run.studentId,run.id,run.taskId,run.majorCode,run.currentStep,json(properties),run.mode);
    }
    static Map<String,Object> map(Object... fields) { var m=new LinkedHashMap<String,Object>();for(int i=0;i<fields.length;i+=2)m.put(fields[i].toString(),fields[i+1]);return m; }
}
