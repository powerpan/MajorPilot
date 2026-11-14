package com.ruoyi.majorpilot.intake;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.recommendation.RecommendationStore;
import com.ruoyi.majorpilot.recommendation.RecommendationView;
import com.ruoyi.majorpilot.shared.*;
import java.util.Map;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** One resumable draft per student; submitted versions never share mutable draft storage. */
@Service @Profile({"local","pilot"})
public class ProfileService {
    public record DraftView(long revision,long baseProfileVersion,String questionnaireVersion,ObjectNode answers,String lastStepKey,String mode) {}
    public record View(DecisionProfileView profile,DraftView draft,long draftRevision) {}
    public record Input(String questionnaireVersion,Long expectedRevision,Long baseProfileVersion,JsonNode answers,String lastStepKey,String mode) {}
    public record Revision(Long expectedRevision) {}
    public record Submitted(DecisionProfileView profile,RecommendationView recommendation,long draftRevision) {}
    private final JdbcTemplate db;private final ObjectMapper mapper;private final RecommendationStore profiles;private final IdempotencyService idem;
    public ProfileService(JdbcTemplate db,ObjectMapper mapper,RecommendationStore profiles,IdempotencyService idem){this.db=db;this.mapper=mapper;this.profiles=profiles;this.idem=idem;}

    @Transactional public View get(StudentPrincipal student){return view(student,lock(student));}
    @Transactional public View save(StudentPrincipal student,Input input){
        ObjectNode answers=validate(input);var row=lock(student);checkRevision(row,input.expectedRevision());checkBase(student,input.baseProfileVersion());
        long revision=number(row,"profile_draft_revision")+1;
        var draft=new DraftView(revision,input.baseProfileVersion(),Questionnaire.VERSION,answers,input.lastStepKey(),input.mode());
        db.update("UPDATE mp_student_account SET profile_draft_json=?,profile_draft_revision=? WHERE id=?",profiles.json(draft),revision,student.internalId());
        return new View(profiles.latestProfile(student.internalId()),draft,revision);
    }
    @Transactional public View discard(StudentPrincipal student,Revision input){
        var row=lock(student);checkRevision(row,input.expectedRevision());long revision=number(row,"profile_draft_revision")+1;
        db.update("UPDATE mp_student_account SET profile_draft_json=NULL,profile_draft_revision=? WHERE id=?",revision,student.internalId());
        return new View(profiles.latestProfile(student.internalId()),null,revision);
    }
    @Transactional public Submitted submit(StudentPrincipal student,String key,Input input){
        ObjectNode answers=validate(input);var row=lock(student);
        return idem.execute(new IdempotencyService.Owner(student.internalId(),null,"student:"+student.publicId()),"POST","/api/app/v1/profile/submit",key,input,Submitted.class,()->{
            checkRevision(row,input.expectedRevision());checkBase(student,input.baseProfileVersion());
            var ids=db.queryForList("SELECT id FROM mp_decision_profile WHERE student_id=? ORDER BY profile_version_no DESC LIMIT 1",Long.class,student.internalId());
            var created=profiles.createPartial(student.internalId(),null,null,input.baseProfileVersion()+1,answers,ids.isEmpty()?null:ids.getFirst());
            long revision=number(row,"profile_draft_revision")+1;
            db.update("UPDATE mp_student_account SET profile_draft_json=NULL,profile_draft_revision=? WHERE id=?",revision,student.internalId());
            return new Submitted(profiles.profile(created.profileInternalId()),created.view(),revision);
        }).data();
    }
    private ObjectNode validate(Input input){
        if(!Questionnaire.VERSION.equals(input.questionnaireVersion()))throw new ApiException(409,"QUESTIONNAIRE_VERSION_STALE");
        if(input.baseProfileVersion()==null||input.baseProfileVersion()<0||input.mode()==null||!Set.of("EDIT","RESTART").contains(input.mode()))throw new ApiException(422,"DECISION_PROFILE_INVALID");
        Questionnaire.pageNumber(input.lastStepKey());return Questionnaire.draft(input.answers());
    }
    private Map<String,Object> lock(StudentPrincipal student){
        var rows=db.queryForList("SELECT status,profile_draft_json,profile_draft_revision FROM mp_student_account WHERE id=? FOR UPDATE",student.internalId());
        if(rows.isEmpty())throw new ApiException(401,"AUTH_REQUIRED");
        if(!"ACTIVE".equals(rows.getFirst().get("status")))throw new ApiException(403,"EMAIL_NOT_VERIFIED");
        return rows.getFirst();
    }
    private void checkBase(StudentPrincipal student,Long expected){
        long current=db.queryForObject("SELECT COALESCE(MAX(profile_version_no),0) FROM mp_decision_profile WHERE student_id=?",Long.class,student.internalId());
        if(expected!=current)throw new ApiException(409,"PROFILE_VERSION_CONFLICT",Map.of("currentProfileVersion",current));
    }
    private static void checkRevision(Map<String,Object> row,Long expected){
        if(expected==null||expected<0)throw new ApiException(422,"DECISION_PROFILE_INVALID");
        long current=number(row,"profile_draft_revision");if(expected!=current)throw new ApiException(409,"PROFILE_DRAFT_CONFLICT",Map.of("currentRevision",current));
    }
    private View view(StudentPrincipal student,Map<String,Object> row){
        DraftView draft=null;
        if(row.get("profile_draft_json")!=null)try{draft=mapper.readValue(row.get("profile_draft_json").toString(),DraftView.class);}catch(Exception invalid){throw new IllegalStateException("Stored profile draft invalid");}
        return new View(profiles.latestProfile(student.internalId()),draft,number(row,"profile_draft_revision"));
    }
    private static long number(Map<String,Object> row,String key){return ((Number)row.get(key)).longValue();}
}
