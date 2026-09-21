package com.ruoyi.majorpilot.report;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.acceptance.ProductEligibility;
import com.ruoyi.majorpilot.report.core.ReportModels.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/** All private references are resolved and verified here before crossing into the pure report core. */
@Component @Profile("local")
public class ReportStore {
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final TransactionTemplate tx;private final TaskContentProvider content;
    public ReportStore(JdbcTemplate jdbc,ObjectMapper mapper,TransactionTemplate tx,TaskContentProvider content){this.jdbc=jdbc;this.mapper=mapper;this.tx=tx;this.content=content;}
    public JdbcTemplate db(){return jdbc;}public ObjectMapper mapper(){return mapper;}public TransactionTemplate tx(){return tx;}
    public String json(Object v){try{return mapper.writeValueAsString(v);}catch(Exception bad){throw new ApiException(422,"VALIDATION_ERROR");}}
    public JsonNode node(Object v){try{return v==null?mapper.nullNode():mapper.readTree(v.toString());}catch(Exception bad){throw new ApiException(409,"REPORT_SOURCE_INVALID");}}
    public String hash(JsonNode v){return CanonicalJson.hash(mapper,v);}
    public static long n(Map<String,Object> r,String k){return ((Number)r.get(k)).longValue();}
    public static Long nullable(Map<String,Object> r,String k){return r.get(k)==null?null:n(r,k);}
    public static String s(Map<String,Object> r,String k){return (String)r.get(k);}
    public static Instant time(Map<String,Object> r,String k){return r.get(k)==null?null:DbTimes.instant(r.get(k));}
    public static Map<String,Object> map(Object... values){var m=new LinkedHashMap<String,Object>();for(int i=0;i<values.length;i+=2)m.put((String)values[i],values[i+1]);return m;}
    public void active(long student){var a=jdbc.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student);if(a.isEmpty())throw new ApiException(401,"AUTH_REQUIRED");if(!"ACTIVE".equals(s(a.getFirst(),"status")))throw new ApiException(403,"PENDING_VERIFICATION".equals(s(a.getFirst(),"status"))?"EMAIL_NOT_VERIFIED":"ACCOUNT_LOCKED");}
    public Map<String,Object> owned(long student,String id){var rows=jdbc.queryForList("SELECT r.*,m.code AS major_code FROM mp_report r LEFT JOIN mp_major m ON m.id=r.major_id WHERE r.public_id=? AND r.student_id=?",id,student);if(rows.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");return rows.getFirst();}
    public Map<String,Object> report(long id){return jdbc.queryForMap("SELECT r.*,m.code AS major_code FROM mp_report r LEFT JOIN mp_major m ON m.id=r.major_id WHERE r.id=?",id);}
    public Map<String,Object> version(long id){return jdbc.queryForMap("SELECT * FROM mp_report_version WHERE id=?",id);}
    public ReportInput input(Map<String,Object> version){try{var value=node(version.get("input_manifest_json"));require(hash(value).equals(s(version,"source_manifest_sha256")));var input=mapper.treeToValue(value,ReportInput.class);var report=report(n(version,"report_id"));String student=jdbc.queryForObject("SELECT public_id FROM mp_student_account WHERE id=?",String.class,n(report,"student_id"));require(input.header().reportId().equals(s(report,"public_id"))&&input.header().reportVersionId().equals(s(version,"public_id"))&&input.header().versionNo()==n(version,"version_no")&&input.header().reportType().name().equals(s(report,"report_type"))&&input.header().studentPublicId().equals(student));if(s(report,"report_type").equals("EXPERIENCE")){String run=jdbc.queryForObject("SELECT public_id FROM mp_experience_run WHERE id=? AND student_id=?",String.class,n(report,"experience_run_id"),n(report,"student_id"));require(input.sources().size()==1&&input.sources().getFirst().pins().runId().equals(run));}return input;}catch(ApiException e){throw e;}catch(Exception invalid){throw new ApiException(409,"REPORT_SOURCE_INVALID");}}
    public void validateRequest(Map<String,Object> version){require(hash(node(version.get("request_manifest_json"))).equals(s(version,"request_manifest_sha256")));}
    static void require(boolean condition){if(!condition)throw new ApiException(409,"REPORT_SOURCE_INVALID");}
    public String profileHash(long id,long student){var p=jdbc.queryForMap("SELECT questionnaire_version,profile_summary_json FROM mp_decision_profile WHERE id=? AND student_id=?",id,student);var answers=new TreeMap<String,JsonNode>();for(var a:jdbc.queryForList("SELECT question_key,answer_json FROM mp_decision_answer WHERE decision_profile_id=? ORDER BY question_key",id))answers.put(s(a,"question_key"),node(a.get("answer_json")));return Secrets.hash(json(map("questionnaireVersion",s(p,"questionnaire_version"),"summary",node(p.get("profile_summary_json")),"answers",answers)));}
    public Source source(long student,long snapshotId,ExperienceVersionRef experience){
        var p=jdbc.queryForMap("SELECT e.*,r.public_id AS run_public_id,r.run_mode AS actual_run_mode,r.student_id AS run_student,r.content_kind,r.status AS run_status,r.closed_input_manifest_json,r.closed_input_sha256 AS run_closed_sha,r.task_version_id AS run_task,r.decision_profile_id AS run_profile,m.code AS major_code,t.public_id AS task_public_id,a.public_id AS student_public_id,d.public_id AS profile_public_id FROM mp_evidence_snapshot e JOIN mp_experience_run r ON r.id=e.experience_run_id JOIN mp_major m ON m.id=r.major_id JOIN mp_task_version t ON t.id=e.task_version_id JOIN mp_student_account a ON a.id=e.student_id JOIN mp_decision_profile d ON d.id=e.decision_profile_id WHERE e.id=? AND e.student_id=?",snapshotId,student);
        require("READY".equals(s(p,"status"))&&Objects.equals(s(p,"run_mode"),s(p,"actual_run_mode"))&&n(p,"run_student")==student&&ProductEligibility.eligible(jdbc,student,n(p,"experience_run_id"))&&"MAJOR".equals(s(p,"content_kind"))&&"CLOSED".equals(s(p,"run_status"))&&n(p,"run_task")==n(p,"task_version_id")&&n(p,"run_profile")==n(p,"decision_profile_id"));
        var closed=node(p.get("closed_input_manifest_json"));require(hash(closed).equals(s(p,"closed_input_sha256"))&&s(p,"closed_input_sha256").equals(s(p,"run_closed_sha"))&&s(p,"actual_run_mode").equals(closed.path("runMode").asText()));
        var task=content.pinned(s(p,"task_public_id"));require(task.manifestSha256().equals(closed.path("taskManifestSha256").asText()));
        String profileSha=profileHash(n(p,"decision_profile_id"),student);require(profileSha.equals(closed.path("profileSha256").asText()));
        var rows=jdbc.queryForList("SELECT * FROM mp_evidence_item WHERE evidence_snapshot_id=? ORDER BY id",snapshotId);var legacy=new ArrayList<Map<String,Object>>();var items=new ArrayList<EvidenceValue>();
        for(var e:rows){List<String> claims=mapper.convertValue(node(e.get("allowed_claim_types_json")),new TypeReference<List<String>>(){});var value=node(e.get("structured_value_json"));require(s(p,"evidence_rule_version").equals(s(e,"rule_version")));
            legacy.add(map("key",s(e,"evidence_key"),"type",s(e,"evidence_type"),"sourceType",s(e,"source_type"),"sourceId",n(e,"source_id"),"value",value,"summary",s(e,"display_summary"),"claims",claims,"observedAt",time(e,"observed_at")));
            // The complete legacy array still authenticates the snapshot; reports do not copy unverified student analysis.
            if(!"STUDENT_ANALYSIS".equals(s(e,"evidence_type")))items.add(new EvidenceValue(s(e,"public_id"),s(e,"evidence_key"),s(e,"evidence_type"),value,s(e,"display_summary"),claims,time(e,"observed_at")));
        }
        require(!items.isEmpty()&&hash(mapper.valueToTree(legacy)).equals(s(p,"snapshot_sha256")));
        var titles=new LinkedHashMap<String,String>();for(var step:task.manifest().path("steps"))titles.put(step.path("stepKey").asText(),step.path("title").asText());
        ProductAuthorization authorization=null;
        if("REVIEW_PREVIEW".equals(s(p,"actual_run_mode"))){var proof=ProductEligibility.authorization(jdbc,student,n(p,"experience_run_id"));require(proof!=null);authorization=new ProductAuthorization(s(proof,"public_id"),s(proof,"authority_code"),s(proof,"authorization_reference"),time(proof,"authorized_at"),s(proof,"original_run_mode"),s(proof,"task_manifest_sha256"),s(proof,"closed_input_sha256"));}
        var pins=new SourcePins(s(p,"run_public_id"),s(p,"actual_run_mode"),"MAJOR","CLOSED",task.taskVersionId(),task.manifestSha256(),task.versionCode(),task.manifest().path("title").asText(),s(p,"profile_public_id"),profileSha,s(p,"closed_input_sha256"),task.manifest().path("reflection").path("questionSetVersion").asText(),titles,authorization);
        var snapshot=new SnapshotRef(s(p,"public_id"),"READY",s(p,"student_public_id"),pins.runId(),pins.taskVersionId(),pins.decisionProfileId(),pins.closedInputSha256(),s(p,"snapshot_sha256"),closed.path("evidenceRuleVersion").asText(),s(p,"evidence_rule_version"));
        return new Source(s(p,"major_code"),s(p,"student_public_id"),pins,snapshot,items,experience);
    }
    public void verifyInput(ReportInput input,boolean currentSources){
        long student=jdbc.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,input.header().studentPublicId());
        for(var source:input.sources()){long snapshot=jdbc.queryForObject("SELECT id FROM mp_evidence_snapshot WHERE public_id=? AND student_id=?",Long.class,source.snapshot().snapshotId(),student);var actual=source(student,snapshot,source.experienceVersion());require(hash(mapper.valueToTree(actual)).equals(hash(mapper.valueToTree(source))));
            if(source.experienceVersion()!=null){var rows=jdbc.queryForList("SELECT v.*,r.current_version_id,r.student_id,r.report_type FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE v.public_id=? AND r.student_id=?",source.experienceVersion().reportVersionId(),student);require(!rows.isEmpty());var v=rows.getFirst();require("EXPERIENCE".equals(s(v,"report_type"))&&Set.of("READY","SUPERSEDED").contains(s(v,"status"))&&hash(node(v.get("structured_report_json"))).equals(source.experienceVersion().reportBodySha256()));if(currentSources&&(!"READY".equals(s(v,"status"))||!Objects.equals(nullable(v,"current_version_id"),n(v,"id"))))throw new ApiException(409,"COMPARISON_SOURCE_STALE");}
        }
    }
}
