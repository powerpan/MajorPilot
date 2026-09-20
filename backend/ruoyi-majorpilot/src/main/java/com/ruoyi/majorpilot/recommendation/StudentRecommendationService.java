package com.ruoyi.majorpilot.recommendation;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.TextNode;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import com.ruoyi.majorpilot.intake.*;
import com.ruoyi.majorpilot.intake.DecisionAnswers.Major;
import com.ruoyi.majorpilot.shared.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Profile("local")
public class StudentRecommendationService {
    public record ProfileInput(String questionnaireVersion,JsonNode answers) {}
    public record DecisionInput(String selectedMajorCode,String overrideReasonCode,String overrideText) {}
    private final JdbcTemplate jdbc;private final RecommendationStore store;private final IdempotencyService idempotency;private final ProductEvents events;
    public StudentRecommendationService(JdbcTemplate jdbc,RecommendationStore store,IdempotencyService idempotency,ProductEvents events) { this.jdbc=jdbc;this.store=store;this.idempotency=idempotency;this.events=events; }
    @Transactional public RecommendationView submit(StudentPrincipal student,String key,ProfileInput input) {
        active(student);
        if(!Questionnaire.VERSION.equals(input.questionnaireVersion()))throw new ApiException(409,"QUESTIONNAIRE_VERSION_STALE");
        DecisionAnswers answers=Questionnaire.complete(input.answers());
        return idempotency.execute(owner(student),"POST","/api/app/v1/decision-profiles",key,input,RecommendationView.class,()->{
            var rows=jdbc.queryForList("SELECT id,profile_version_no FROM mp_decision_profile WHERE student_id=? ORDER BY profile_version_no DESC LIMIT 1",student.internalId());
            Long supersedes=rows.isEmpty()?null:((Number)rows.getFirst().get("id")).longValue();long version=rows.isEmpty()?1:((Number)rows.getFirst().get("profile_version_no")).longValue()+1;
            return store.create(student.internalId(),null,null,version,answers,supersedes).view();
        }).data();
    }
    @Transactional public RecommendationDecision decide(StudentPrincipal student,String recommendationId,String key,DecisionInput input) {
        active(student);Major selected;
        try{selected=Major.valueOf(input.selectedMajorCode());}catch(RuntimeException invalid){throw new ApiException(422,"DECISION_PROFILE_INVALID");}
        RecommendationView recommendation=store.owned(student.internalId(),recommendationId);
        boolean overridden=selected!=recommendation.primaryMajor();
        String reason=null,text=null;
        if(overridden) {
            try{reason=input.overrideReasonCode()==null?"DECLINED":RecommendationDecision.OverrideReason.valueOf(input.overrideReasonCode()).name();}catch(RuntimeException invalid){throw new ApiException(422,"DECISION_PROFILE_INVALID");}
            if(input.overrideText()!=null)text=Questionnaire.text(TextNode.valueOf(input.overrideText()),300,"overrideText");
        } else if(input.overrideReasonCode()!=null||input.overrideText()!=null)throw new ApiException(422,"DECISION_PROFILE_INVALID");
        final String selectedReason=reason,selectedText=text;
        return idempotency.execute(owner(student),"POST","/api/app/v1/recommendations/"+recommendationId+"/decision",key,input,RecommendationDecision.class,()->{
            Long internal=jdbc.queryForObject("SELECT id FROM mp_recommendation WHERE public_id=? AND student_id=? FOR UPDATE",Long.class,recommendationId,student.internalId());
            Long previous=jdbc.queryForObject("SELECT COALESCE(MAX(decision_no),0) FROM mp_recommendation_decision WHERE recommendation_id=?",Long.class,internal);
            long decisionNo=previous+1;String id=PublicIds.next();Instant now=Instant.now();
            jdbc.update("INSERT INTO mp_recommendation_decision(public_id,recommendation_id,student_id,decision_no,decision_type,selected_major_code,override_reason_code,override_text,decided_at) VALUES(?,?,?,?,?,?,?,?,?)",id,internal,student.internalId(),decisionNo,overridden?"OVERRIDDEN":"ACCEPTED",selected.name(),selectedReason,selectedText,Timestamp.from(now));
            var properties=new LinkedHashMap<String,Object>();properties.put("decisionType",overridden?"OVERRIDDEN":"ACCEPTED");properties.put("recommendedMajor",recommendation.primaryMajor().name());properties.put("selectedMajor",selected.name());properties.put("reasonCode",selectedReason);
            events.record(student.internalId(),null,internal,"recommendation.decision.made",properties);
            return new RecommendationDecision(id,recommendationId,decisionNo,overridden?"OVERRIDDEN":"ACCEPTED",recommendation.primaryMajor(),selected,selectedReason,selectedText,now,"UNAVAILABLE");
        }).data();
    }
    @Transactional public RecommendationView get(StudentPrincipal student,String id) { active(student);return store.owned(student.internalId(),id); }
    @Transactional public List<Map<String,Object>> profiles(StudentPrincipal student) { active(student);return store.profiles(student.internalId()); }
    @Transactional public Map<String,Object> dashboard(StudentPrincipal student) {
        active(student);var data=new LinkedHashMap<String,Object>();data.put("recommendation",store.latestStudent(student.internalId()));
        data.put("majors",RecommendationView.majorDifferencesList().stream().map(major->Map.of("majorCode",major.majorCode(),"name",major.name(),"status","NOT_STARTED","availability","UNAVAILABLE")).toList());
        var choices=jdbc.queryForList("SELECT d.public_id,d.selected_major_code,d.decision_type,r.public_id AS recommendation_public_id FROM mp_recommendation_decision d JOIN mp_recommendation r ON r.id=d.recommendation_id WHERE d.student_id=? ORDER BY d.decided_at DESC,d.id DESC LIMIT 1",student.internalId());
        data.put("currentDecision",choices.isEmpty()?null:Map.of("decisionId",choices.getFirst().get("public_id"),"recommendationId",choices.getFirst().get("recommendation_public_id"),"selectedMajorCode",choices.getFirst().get("selected_major_code"),"decisionType",choices.getFirst().get("decision_type")));
        data.put("nextStep","TASK_CONTENT_PREPARING");return data;
    }
    private void active(StudentPrincipal student) { var rows=jdbc.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student.internalId());if(rows.isEmpty())throw new ApiException(401,"AUTH_REQUIRED");if(!"ACTIVE".equals(rows.getFirst().get("status")))throw new ApiException(403,"EMAIL_NOT_VERIFIED"); }
    private static IdempotencyService.Owner owner(StudentPrincipal student) { return new IdempotencyService.Owner(student.internalId(),null,"student:"+student.publicId()); }
}
