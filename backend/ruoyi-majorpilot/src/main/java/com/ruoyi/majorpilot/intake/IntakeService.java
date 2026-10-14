package com.ruoyi.majorpilot.intake;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.analytics.ProductEvents;
import com.ruoyi.majorpilot.recommendation.RecommendationStore;
import com.ruoyi.majorpilot.recommendation.RecommendationView;
import com.ruoyi.majorpilot.shared.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Profile({"local","pilot"})
public class IntakeService implements IntakeClaimPort {
    public record View(String intakeSessionId,String questionnaireVersion,String status,long revision,Instant expiresAt,String lastStepKey,ObjectNode answers,String recommendationId) {}
    public record Created(View view,String newSecret) {}
    public record Draft(String questionnaireVersion,Long expectedRevision,String stepKey,JsonNode answers) {}
    public record Submission(String questionnaireVersion,Long expectedRevision,JsonNode answers) {}
    private final JdbcTemplate jdbc;private final ObjectMapper mapper;private final RecommendationStore recommendations;private final IdempotencyService idempotency;private final ProductEvents events;
    public IntakeService(JdbcTemplate jdbc,ObjectMapper mapper,RecommendationStore recommendations,IdempotencyService idempotency,ProductEvents events) { this.jdbc=jdbc;this.mapper=mapper;this.recommendations=recommendations;this.idempotency=idempotency;this.events=events; }

    @Transactional public Created create(String version,String existingSecret) {
        checkVersion(version==null?Questionnaire.VERSION:version);
        if(existingSecret!=null&&existingSecret.length()<=128) {
            var existing=jdbc.queryForList("SELECT * FROM mp_intake_session WHERE secret_hash=? AND status IN ('DRAFT','SUBMITTED') AND expires_at>? FOR UPDATE",Secrets.hash(existingSecret),Timestamp.from(Instant.now()));
            if(!existing.isEmpty()) { var row=existing.getFirst();touch(row);return new Created(view(row),null); }
        }
        String publicId=PublicIds.next(),secret=Secrets.random();Instant expiry=Instant.now().plusSeconds(7*86400);
        long id=recommendations.insert("INSERT INTO mp_intake_session(public_id,secret_hash,questionnaire_version,status,draft_json,expires_at,last_step_key,row_version) VALUES(?,?,?,'DRAFT','{}',?,'step-1',0)",publicId,Secrets.hash(secret),Questionnaire.VERSION,Timestamp.from(expiry));
        events.record(null,id,null,"intake.session.started",Map.of("questionnaireVersion",Questionnaire.VERSION));
        return new Created(new View(publicId,Questionnaire.VERSION,"DRAFT",0,expiry,"step-1",mapper.createObjectNode(),null),secret);
    }
    @Transactional public View get(String id,String secretHash) { var row=lock(id,secretHash);touch(row);return view(row); }
    @Transactional public View save(String id,String secretHash,Draft input) {
        checkVersion(input.questionnaireVersion());ObjectNode patch=Questionnaire.pageDraft(input.stepKey(),input.answers());
        var row=lock(id,secretHash);revision(row,input.expectedRevision());ObjectNode answers=readAnswers(row);answers.setAll(patch);
        long updated=number(row,"row_version")+1;
        jdbc.update("UPDATE mp_intake_session SET draft_json=?,status='DRAFT',last_step_key=?,row_version=?,updated_at=? WHERE id=?",recommendations.json(answers),input.stepKey(),updated,Timestamp.from(Instant.now()),number(row,"id"));
        row.put("draft_json",recommendations.json(answers));row.put("status","DRAFT");row.put("last_step_key",input.stepKey());row.put("row_version",updated);touch(row);
        events.record(null,number(row,"id"),null,"intake.step.saved",Map.of("stepKey",input.stepKey(),"revision",updated));
        return view(row);
    }
    @Transactional public RecommendationView submit(String id,String secretHash,String key,Submission input) {
        checkVersion(input.questionnaireVersion());DecisionAnswers answers=Questionnaire.complete(input.answers());
        var row=lock(id,secretHash);long intake=number(row,"id");
        var result=idempotency.execute(new IdempotencyService.Owner(null,intake,"intake:"+id),"POST","/api/public/v1/intake-sessions/"+id+"/submit",key,input,RecommendationView.class,()->{
            if(input.expectedRevision()==null||input.expectedRevision()<0)throw new ApiException(422,"DECISION_PROFILE_INVALID");
            RecommendationView previous=recommendations.forIntakeRevision(intake,input.expectedRevision());
            if(previous!=null) {
                if(!sameAnswers(previous.decisionProfileId(),answers))throw conflict(row);
                return previous;
            }
            revision(row,input.expectedRevision());
            var previousProfiles=jdbc.queryForList("SELECT id,profile_version_no FROM mp_decision_profile WHERE intake_session_id=? ORDER BY profile_version_no DESC LIMIT 1",intake);
            Long supersedes=previousProfiles.isEmpty()?null:number(previousProfiles.getFirst(),"id");
            long version=previousProfiles.isEmpty()?1:number(previousProfiles.getFirst(),"profile_version_no")+1;
            var created=recommendations.create(null,intake,input.expectedRevision(),version,answers,supersedes);
            long updated=number(row,"row_version")+1;
            jdbc.update("UPDATE mp_intake_session SET status='SUBMITTED',draft_json=?,last_step_key='step-12',row_version=?,updated_at=? WHERE id=?",recommendations.json(Questionnaire.json(answers)),updated,Timestamp.from(Instant.now()),intake);
            row.put("row_version",updated);row.put("status","SUBMITTED");return created.view();
        });
        touch(row);return result.data();
    }
    @Transactional public RecommendationView recommendation(String id,String secretHash) { var row=lock(id,secretHash);if(!"SUBMITTED".equals(row.get("status")))throw new ApiException(409,"DECISION_PROFILE_REQUIRED");var recommendation=recommendations.latestIntake(number(row,"id"));touch(row);return recommendation; }
    public Instant expiration(String id,String secretHash) {
        var rows=jdbc.queryForList("SELECT expires_at FROM mp_intake_session WHERE public_id=? AND secret_hash=? AND status IN ('DRAFT','SUBMITTED')",id,secretHash);
        return rows.isEmpty()?null:instant(rows.getFirst(),"expires_at");
    }
    public Instant expirationForSecret(String secretHash) {
        var rows=jdbc.queryForList("SELECT expires_at FROM mp_intake_session WHERE secret_hash=? AND status IN ('DRAFT','SUBMITTED')",secretHash);
        return rows.isEmpty()?null:instant(rows.getFirst(),"expires_at");
    }
    /** Same credential check as domain reads, but this does not renew expiry before a successful event batch. */
    public long authenticateForEvent(String id,String secretHash) { return number(lock(id,secretHash),"id"); }
    public void touchForEvent(long id) { jdbc.update("UPDATE mp_intake_session SET expires_at=?,updated_at=? WHERE id=? AND status IN ('DRAFT','SUBMITTED')",Timestamp.from(Instant.now().plusSeconds(7*86400)),Timestamp.from(Instant.now()),id); }

    @Override public ClaimableIntake lockClaimable(String publicId,String secretHash) {
        var row=lock(publicId,secretHash);
        if(!"SUBMITTED".equals(row.get("status")))throw new ApiException(409,"DECISION_PROFILE_REQUIRED");
        long id=number(row,"id");
        var profiles=jdbc.queryForList("SELECT id FROM mp_decision_profile WHERE intake_session_id=? ORDER BY profile_version_no DESC LIMIT 1",id);
        if(profiles.isEmpty())throw new ApiException(409,"DECISION_PROFILE_REQUIRED");
        long profile=number(profiles.getFirst(),"id");
        var channel=jdbc.queryForObject("SELECT JSON_UNQUOTE(answer_json) FROM mp_decision_answer WHERE decision_profile_id=? AND question_key='acquisitionChannel'",String.class,profile);
        return new ClaimableIntake(id,profile,(String)row.get("questionnaire_version"),channel==null?"DECLINED":channel);
    }
    @Override public void claimAll(long intake,long student) {
        if(jdbc.update("UPDATE mp_intake_session SET status='CLAIMED',claimed_student_id=?,claimed_at=?,draft_json='{}',row_version=row_version+1 WHERE id=? AND status='SUBMITTED' AND claimed_student_id IS NULL AND expires_at>?",student,Timestamp.from(Instant.now()),intake,Timestamp.from(Instant.now()))!=1)throw new ApiException(409,"INTAKE_ALREADY_CLAIMED");
        jdbc.update("UPDATE mp_decision_profile SET student_id=?,status=IF(status='SUPERSEDED',status,'CLAIMED') WHERE intake_session_id=?",student,intake);
        jdbc.update("UPDATE mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id SET r.student_id=? WHERE p.intake_session_id=?",student,intake);
        jdbc.update("UPDATE mp_product_event SET student_id=? WHERE intake_session_id=?",student,intake);
        jdbc.update("UPDATE mp_idempotency_record SET owner_student_id=? WHERE owner_intake_session_id=?",student,intake);
    }
    private Map<String,Object> lock(String id,String hash) {
        if(id==null||hash==null)throw new ApiException(401,"AUTH_REQUIRED");
        var rows=jdbc.queryForList("SELECT * FROM mp_intake_session WHERE public_id=? AND secret_hash=? FOR UPDATE",id,hash);
        if(rows.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");
        var row=rows.getFirst();
        if("CLAIMED".equals(row.get("status")))throw new ApiException(409,"INTAKE_ALREADY_CLAIMED");
        if(!List.of("DRAFT","SUBMITTED").contains(row.get("status"))||!instant(row,"expires_at").isAfter(Instant.now()))throw new ApiException(401,"INTAKE_EXPIRED");
        return row;
    }
    private void revision(Map<String,Object> row,Long expected) { if(expected==null||expected<0)throw new ApiException(422,"DECISION_PROFILE_INVALID");if(expected!=number(row,"row_version"))throw conflict(row); }
    private ApiException conflict(Map<String,Object> row) { return new ApiException(409,"INTAKE_REVISION_CONFLICT",Map.of("currentRevision",number(row,"row_version"))); }
    private void touch(Map<String,Object> row) { Instant expiry=Instant.now().plusSeconds(7*86400);jdbc.update("UPDATE mp_intake_session SET expires_at=?,updated_at=? WHERE id=?",Timestamp.from(expiry),Timestamp.from(Instant.now()),number(row,"id"));row.put("expires_at",Timestamp.from(expiry)); }
    private View view(Map<String,Object> row) {
        var recommendations=jdbc.queryForList("SELECT r.public_id FROM mp_recommendation r JOIN mp_decision_profile p ON p.id=r.decision_profile_id WHERE p.intake_session_id=? ORDER BY p.profile_version_no DESC LIMIT 1",number(row,"id"));
        return new View((String)row.get("public_id"),(String)row.get("questionnaire_version"),(String)row.get("status"),number(row,"row_version"),instant(row,"expires_at"),(String)row.get("last_step_key"),readAnswers(row),recommendations.isEmpty()?null:(String)recommendations.getFirst().get("public_id"));
    }
    private ObjectNode readAnswers(Map<String,Object> row) { try{return (ObjectNode)mapper.readTree((String)row.get("draft_json"));}catch(Exception invalid){throw new IllegalStateException("Stored intake invalid");} }
    private boolean sameAnswers(String profileId,DecisionAnswers answers) {
        ObjectNode saved=mapper.createObjectNode();
        jdbc.query("SELECT a.question_key,a.answer_json FROM mp_decision_answer a JOIN mp_decision_profile p ON p.id=a.decision_profile_id WHERE p.public_id=?",rs->{try{saved.set(rs.getString("question_key"),mapper.readTree(rs.getString("answer_json")));}catch(Exception invalid){throw new IllegalStateException("Stored answer invalid");}},profileId);
        return saved.equals(Questionnaire.json(answers));
    }
    private static long number(Map<String,Object> row,String key) { return ((Number)row.get(key)).longValue(); }
    private static Instant instant(Map<String,Object> row,String key) { return com.ruoyi.majorpilot.shared.DbTimes.instant(row.get(key)); }
    private static void checkVersion(String version) { if(!Questionnaire.VERSION.equals(version))throw new ApiException(409,"QUESTIONNAIRE_VERSION_STALE"); }
}
