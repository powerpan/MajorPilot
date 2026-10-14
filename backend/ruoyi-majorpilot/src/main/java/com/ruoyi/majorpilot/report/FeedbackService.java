package com.ruoyi.majorpilot.report;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.time.Duration;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.report.ReportStore.*;
@Service @Profile({"local","pilot"})
public class FeedbackService {
    private final ReportStore store;private final IdempotencyService idem;private final RateLimits limits;
    public FeedbackService(ReportStore store,IdempotencyService idem,RateLimits limits){this.store=store;this.idem=idem;this.limits=limits;}
    public ReportDtos.FeedbackAccepted submit(StudentPrincipal student,String key,ReportDtos.Feedback input){
        store.tx().executeWithoutResult(tx->store.active(student.internalId()));
        var owner=new IdempotencyService.Owner(student.internalId(),null,"student:"+student.publicId());
        var replay=idem.replay(owner,"POST","/api/app/v1/feedback",key,input,ReportDtos.FeedbackAccepted.class);if(replay.isPresent())return replay.get();
        limits.require("feedback",student.publicId(),5,Duration.ofMinutes(1));
        return idem.execute(owner,"POST","/api/app/v1/feedback",key,input,ReportDtos.FeedbackAccepted.class,()->{
            store.active(student.internalId());validate(input);Long run=null,report=null,version=null,major=null,task=null;
            if(input.contextType()!=null){
                if(input.contextType().equals("EXPERIENCE_RUN")){var rows=store.db().queryForList("SELECT id,major_id,task_version_id FROM mp_experience_run WHERE public_id=? AND student_id=?",input.contextPublicId(),student.internalId());if(rows.isEmpty())throw invalid();var r=rows.getFirst();run=n(r,"id");major=nullable(r,"major_id");task=nullable(r,"task_version_id");}
                else{var rows=store.db().queryForList("SELECT v.id,p.id AS report_id,p.major_id,p.experience_run_id,r.task_version_id FROM mp_report_version v JOIN mp_report p ON p.id=v.report_id LEFT JOIN mp_experience_run r ON r.id=p.experience_run_id WHERE v.public_id=? AND p.student_id=? AND v.status IN ('READY','SUPERSEDED')",input.contextPublicId(),student.internalId());if(rows.isEmpty())throw invalid();var r=rows.getFirst();version=n(r,"id");report=n(r,"report_id");run=nullable(r,"experience_run_id");major=nullable(r,"major_id");task=nullable(r,"task_version_id");}
            }
            boolean survey=input.surveyVersion()!=null,first=survey&&report!=null&&store.db().queryForObject("SELECT COUNT(*) FROM mp_student_feedback WHERE student_id=? AND report_id=? AND survey_version='report-value-v1' AND first_valid_survey=TRUE",Integer.class,student.internalId(),report)==0;
            String id=PublicIds.next();store.db().update("INSERT INTO mp_student_feedback(public_id,student_id,feedback_type,context_type,experience_run_id,report_id,report_version_id,major_id,task_version_id,rating,comment_text,survey_version,answers_json,diagnostic_code,first_valid_survey) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,student.internalId(),input.feedbackType(),input.contextType(),run,report,version,major,task,input.rating(),input.comment(),input.surveyVersion(),input.answers()==null?null:store.json(input.answers()),input.diagnosticCode(),first);
            long internal=store.db().queryForObject("SELECT id FROM mp_student_feedback WHERE public_id=?",Long.class,id);
            if(survey)store.db().update("INSERT INTO mp_product_event(event_id,event_name,event_version,source,occurred_at,received_at,student_id,experience_run_id,report_id,report_version_id,feedback_id,properties_json) VALUES(?,'report.feedback.submitted','v1','BACKEND',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?,?,?,?,?,?)",PublicIds.next(),student.internalId(),run,report,version,internal,store.json(map("insightResponse",input.answers().has("insightResponse")?input.answers().path("insightResponse").asInt():null,"clarityChange",input.answers().has("clarityChange")?input.answers().path("clarityChange").asInt():null,"coverageVersion",input.surveyVersion())));
            return new ReportDtos.FeedbackAccepted(id,"RECEIVED");
        }).data();
    }
    public static void validate(ReportDtos.Feedback i){
        if(i==null||i.feedbackType()==null||!Set.of("GENERAL","TASK","REPORT","TECHNICAL").contains(i.feedbackType())||(i.contextType()==null)!=(i.contextPublicId()==null)||i.contextType()!=null&&!Set.of("EXPERIENCE_RUN","REPORT_VERSION").contains(i.contextType())||i.contextPublicId()!=null&&!i.contextPublicId().matches("[0-7][0-9A-HJKMNP-TV-Z]{25}")||i.feedbackType().equals("REPORT")&&!"REPORT_VERSION".equals(i.contextType()))throw invalid();
        if(i.rating()!=null&&(i.rating()<1||i.rating()>5)||i.comment()!=null&&i.comment().codePointCount(0,i.comment().length())>1000||i.diagnosticCode()!=null&&!Set.of("REPORT_GENERATION_FAILED","REPORT_VERSION_CHANGED","NETWORK_ERROR","OFFLINE").contains(i.diagnosticCode()))throw invalid();
        if((i.surveyVersion()==null)!=(i.answers()==null))throw invalid();
        if(i.answers()!=null){if(!"report-value-v1".equals(i.surveyVersion())||!"REPORT_VERSION".equals(i.contextType())||!i.answers().isObject()||i.answers().isEmpty()||i.answers().size()>3)throw invalid();var keys=i.answers().fieldNames();while(keys.hasNext()){String k=keys.next();var v=i.answers().path(k);if(Set.of("insightResponse","clarityChange").contains(k)){if(!v.isIntegralNumber()||!v.canConvertToInt()||v.asInt()<1||v.asInt()>5)throw invalid();}else if(k.equals("nextAction")){if(!v.isTextual()||!Set.of("TRY_ANOTHER","LEARN_CURRENT","PAUSE_DECISION","OTHER","DECLINED").contains(v.asText()))throw invalid();}else throw invalid();}}
        if(i.rating()==null&&(i.comment()==null||i.comment().isBlank())&&i.answers()==null)throw invalid();
    }
    private static ApiException invalid(){return new ApiException(422,"FEEDBACK_INVALID");}
}
