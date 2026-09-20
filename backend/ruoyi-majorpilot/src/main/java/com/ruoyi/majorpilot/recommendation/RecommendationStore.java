package com.ruoyi.majorpilot.recommendation;

import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import com.ruoyi.majorpilot.intake.DecisionAnswers;
import com.ruoyi.majorpilot.intake.Questionnaire;
import com.ruoyi.majorpilot.shared.ApiException;
import com.ruoyi.majorpilot.shared.PublicIds;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;

/** Writes immutable profile/recommendation snapshots inside the caller's domain transaction. */
@Service @Profile("local")
public class RecommendationStore {
    public record Created(long profileInternalId,long recommendationInternalId,RecommendationView view) {}
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final ProductEvents events;
    public RecommendationStore(JdbcTemplate jdbc,ObjectMapper mapper,ProductEvents events) { this.jdbc=jdbc;this.mapper=mapper;this.events=events; }
    public Created create(Long student,Long intake,Long inputRevision,long version,DecisionAnswers answers,Long supersedes) {
        Instant now=Instant.now();String profileId=PublicIds.next(),recId=PublicIds.next();
        Map<String,Object> summary=Map.of("applicationStage",answers.applicationStage(),"currentField",answers.currentField(),"foundationSelfView",answers.foundationSelfView());
        long profile=insert("INSERT INTO mp_decision_profile(public_id,student_id,intake_session_id,profile_version_no,source_draft_revision,questionnaire_version,submitted_at,profile_summary_json,status,supersedes_profile_id) VALUES(?,?,?,?,?,?,?,?,?,?)",profileId,student,intake,version,inputRevision,Questionnaire.VERSION,Timestamp.from(now),json(summary),student==null?"SUBMITTED":"CLAIMED",supersedes);
        var normalized=Questionnaire.json(answers);
        normalized.fields().forEachRemaining(field->jdbc.update("INSERT INTO mp_decision_answer(decision_profile_id,question_key,answer_json,answer_text_redacted,schema_version,created_at) VALUES(?,?,?,NULL,?,?)",profile,field.getKey(),json(field.getValue()),Questionnaire.VERSION,Timestamp.from(now)));
        if(supersedes!=null)jdbc.update("UPDATE mp_decision_profile SET status='SUPERSEDED' WHERE id=?",supersedes);
        RecommendationView view=new MajorCatalog(jdbc).project(RecommendationView.create(profileId,recId,version,answers,now,student==null));
        long recommendation=insert("INSERT INTO mp_recommendation(public_id,student_id,decision_profile_id,recommendation_type,source_run_id,completed_major_codes_json,rule_version,primary_major_code,alternative_order_json,tie_detected,tie_break_rule,explanation_status,explanation_version,generated_at,safe_result_json) VALUES(?,?,?,'INITIAL',NULL,'[]',?,?,?,?,?,'STRUCTURED_ONLY',?,?,?)",recId,student,profile,view.ruleVersion(),view.primaryMajor().name(),json(view.alternativeMajors()),view.tieDetected(),view.tieBreakRule().name(),view.explanationVersion(),Timestamp.from(now),json(view));
        int order=0;
        for(var reason:view.reasons())jdbc.update("INSERT INTO mp_recommendation_reason(recommendation_id,reason_code,reason_type,major_code,reason_order,source_question_keys_json,display_text,rule_version) VALUES(?,?,?,?,?,?,?,?)",recommendation,reason.code().name(),reason.reasonType().name(),reason.majorCode().name(),++order,json(reason.sourceQuestionKeys()),reason.text(),view.ruleVersion());
        events.record(student,intake,recommendation,"intake.profile.submitted",Map.of("questionnaireVersion",Questionnaire.VERSION,"requiredAnswerCount",Questionnaire.REQUIRED_PAGE_COUNT));
        events.record(student,intake,recommendation,"recommendation.generated",Map.of("ruleVersion",view.ruleVersion(),"primaryMajor",view.primaryMajor().name(),"tieDetected",view.tieDetected(),"explanationStatus",view.explanationStatus()));
        return new Created(profile,recommendation,view);
    }
    public RecommendationView forIntakeRevision(long intake,long revision) {
        var rows=jdbc.queryForList("SELECT r.safe_result_json FROM mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE p.intake_session_id=? AND p.source_draft_revision=? AND r.recommendation_type='INITIAL' AND r.rule_version=?",intake,revision,InitialRecommendationRules.RULE_VERSION);
        return rows.isEmpty()?null:decode((String)rows.getFirst().get("safe_result_json"));
    }
    public RecommendationView latestIntake(long intake) {
        var rows=jdbc.queryForList("SELECT r.safe_result_json FROM mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE p.intake_session_id=? AND r.recommendation_type='INITIAL' ORDER BY p.profile_version_no DESC,r.id DESC LIMIT 1",intake);
        if(rows.isEmpty())throw new ApiException(404,"RECOMMENDATION_NOT_FOUND");
        return decode((String)rows.getFirst().get("safe_result_json"));
    }
    public RecommendationView owned(long student,String publicId) {
        var rows=jdbc.queryForList("SELECT safe_result_json FROM mp_recommendation WHERE public_id=? AND student_id=? AND recommendation_type='INITIAL'",publicId,student);
        if(rows.isEmpty())throw new ApiException(404,"RECOMMENDATION_NOT_FOUND");
        return decode((String)rows.getFirst().get("safe_result_json")).forStudent();
    }
    public RecommendationView latestStudent(long student) {
        var rows=jdbc.queryForList("SELECT r.safe_result_json FROM mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE r.student_id=? AND r.recommendation_type='INITIAL' ORDER BY p.profile_version_no DESC,r.id DESC LIMIT 1",student);
        return rows.isEmpty()?null:decode((String)rows.getFirst().get("safe_result_json")).forStudent();
    }
    public List<Map<String,Object>> profiles(long student) {
        return jdbc.query("SELECT public_id,profile_version_no,questionnaire_version,submitted_at,status,profile_summary_json FROM mp_decision_profile WHERE student_id=? ORDER BY profile_version_no DESC LIMIT 50",(rs,row)->{
            Map<String,Object> value=new LinkedHashMap<>();value.put("decisionProfileId",rs.getString("public_id"));value.put("profileVersion",rs.getLong("profile_version_no"));value.put("questionnaireVersion",rs.getString("questionnaire_version"));value.put("submittedAt",rs.getTimestamp("submitted_at").toInstant());value.put("status",rs.getString("status"));
            try{value.put("summary",mapper.readTree(rs.getString("profile_summary_json")));}catch(Exception invalid){throw new IllegalStateException("Stored profile invalid");}return value;
        },student);
    }
    public String json(Object value) { try{return mapper.writeValueAsString(value);}catch(Exception invalid){throw new IllegalStateException("Domain serialization failed");} }
    private RecommendationView decode(String value) { try{return new MajorCatalog(jdbc).project(mapper.readValue(value,RecommendationView.class));}catch(Exception invalid){throw new IllegalStateException("Stored recommendation invalid");} }
    public long insert(String sql,Object... values) {
        var key=new GeneratedKeyHolder();jdbc.update(connection->{var statement=connection.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<values.length;i++)statement.setObject(i+1,values[i]);return statement;},key);
        if(key.getKey()==null)throw new IllegalStateException("Missing generated key");return key.getKey().longValue();
    }
}
