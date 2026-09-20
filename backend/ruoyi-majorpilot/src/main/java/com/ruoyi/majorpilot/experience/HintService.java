package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.content.TaskContent;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.time.Duration;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;
@Service @Profile("local")
public class HintService {
    private final RunService runs;private final RunStore db;private final HintProvider provider;private final RateLimits limits;
    public HintService(RunService runs,HintProvider provider,RateLimits limits){this.runs=runs;this.db=runs.store();this.provider=provider;this.limits=limits;}
    public record Ticket(String hintId) {}
    record Prepared(Row run,TaskContent.Version version,JsonNode definition,Map<String,Object> record) {}
    RunDtos.HintResult view(Map<String,Object> row) {return new RunDtos.HintResult(s(row,"public_id"),s(row,"step_key"),(int)n(row,"hint_level"),s(row,"status"),db.node(row.get("response_json")),s(row,"prompt_version"));}
    Map<String,Object> owned(Row run,String hintId) {var records=db.jdbc().queryForList("SELECT * FROM mp_hint_request WHERE experience_run_id=? AND public_id=?",run.id(),hintId);if(records.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");return records.getFirst();}
    public RunDtos.HintResult get(StudentPrincipal student,String id,String hintId) {return runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);return view(owned(run,hintId));});}
    public RunDtos.HintResult hint(StudentPrincipal student,String id,String key,RunDtos.Hint input) {
        if(input.hintLevel()==null||input.hintLevel()<1||input.hintLevel()>3)throw new ApiException(422,"VALIDATION_ERROR");
        runs.transactions().executeWithoutResult(status->{db.activeStudent(student);db.owned(student,id);});
        var created=runs.idempotency().execute(runs.owner(student),"POST","/api/app/v1/experience-runs/"+id+"/hints",key,input,Ticket.class,()->{
            db.activeStudent(student);var run=db.owned(student,id);writable(run,"IN_PROGRESS");var definition=runs.stepDefinition(run,input.stepKey());runs.dependencies(run,definition);var state=runs.stepState(run,input.stepKey());
            try{limits.require("experience-hints",student.publicId(),6,Duration.ofMinutes(1));}catch(ApiException limited){if(limited.status==429)throw new ApiException(429,"HINT_RATE_LIMITED");throw limited;}
            if(db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_hint_request WHERE experience_run_id=? AND requested_at>UTC_TIMESTAMP(3)-INTERVAL 1 DAY",Integer.class,run.id())>=100)throw new ApiException(429,"HINT_RATE_LIMITED");
            String hint=PublicIds.next();var safe=db.mapper().createObjectNode();var allowed=db.mapper().createObjectNode();JsonNode response=runs.response(state);for(var field:definition.path("hintContextFields"))if(response.has(field.asText()))allowed.set(field.asText(),response.get(field.asText()));safe.set("input",allowed);
            db.jdbc().update("INSERT INTO mp_hint_request(public_id,experience_run_id,step_key,hint_level,input_revision,request_context_json,status,prompt_version) VALUES(?,?,?,?,?,?,'PENDING','task-hint-v1')",hint,run.id(),input.stepKey(),input.hintLevel(),n(state,"current_revision"),db.json(safe));db.event(run,"hint.requested",Map.of("stepKey",input.stepKey(),"hintLevel",input.hintLevel()));return new Ticket(hint);
        });
        String hintId=created.data().hintId();if(created.replayed())return get(student,id,hintId);
        Prepared prepared=runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);return new Prepared(run,runs.version(run),runs.stepDefinition(run,input.stepKey()),owned(run,hintId));});
        String text=staticHint(prepared.definition,input.hintLevel());HintProvider.Result output;
        try{output=provider.hint(new HintProvider.Context(prepared.version.taskVersionId(),prepared.version.versionCode(),input.stepKey(),input.hintLevel(),"task-hint-v1",db.node(prepared.record.get("request_context_json")),text,prepared.run.kind().equals("DEMO")));if(output==null||output.response()==null||!Set.of("SUCCEEDED","FALLBACK").contains(output.status()))output=fallback(prepared.version,input.stepKey(),input.hintLevel(),text);}
        catch(RuntimeException unavailable){output=fallback(prepared.version,input.stepKey(),input.hintLevel(),text);}
        HintProvider.Result finalOutput=output;
        return runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);var row=owned(run,hintId);if(!s(row,"status").equals("PENDING"))return view(row);
            boolean stale=!run.status().equals("IN_PROGRESS")||n(runs.stepState(run,input.stepKey()),"current_revision")!=n(row,"input_revision");
            db.jdbc().update("UPDATE mp_hint_request SET status=?,response_json=?,provider=?,model=?,prompt_version=?,completed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='PENDING'",stale?"FAILED":finalOutput.status(),stale?null:db.json(finalOutput.response()),finalOutput.provider(),finalOutput.model(),finalOutput.promptVersion(),n(row,"id"));db.event(run,"hint.completed",Map.of("stepKey",input.stepKey(),"hintLevel",input.hintLevel(),"status",stale?"FAILED":finalOutput.status()));return view(owned(run,hintId));});
    }
    String staticHint(JsonNode definition,int level) {for(var hint:definition.path("hints"))if(hint.path("level").asInt()==level)return hint.path("text").asText();throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
    HintProvider.Result fallback(TaskContent.Version version,String step,int level,String text) {return new HintProvider.Result(db.mapper().valueToTree(map("schemaVersion","hint-result-v1","taskVersionId",version.taskVersionId(),"stepKey",step,"hintLevel",level,"hintText",text)),"STATIC",null,"task-hint-v1","FALLBACK");}
    /** A process dying after PENDING cannot leave a hint permanently loading. No external calls here. */
    @Scheduled(fixedDelay=30000) public void recoverPending() {
        var candidates=db.jdbc().queryForList("SELECT h.public_id,r.id AS run_id,s.id AS student_id FROM mp_hint_request h JOIN mp_experience_run r ON r.id=h.experience_run_id JOIN mp_student_account s ON s.id=r.student_id WHERE h.status='PENDING' AND h.requested_at<UTC_TIMESTAMP(3)-INTERVAL 45 SECOND ORDER BY h.id LIMIT 20");
        for(var candidate:candidates)runs.transactions().executeWithoutResult(status->{
            // This internal recovery is not a student read: a disabled demo must still leave PENDING.
            // The account lock is the same serialization boundary used by writes and deletion.
            var accounts=db.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",n(candidate,"student_id"));if(accounts.isEmpty())return;
            var records=db.jdbc().queryForList(RunStore.SELECT+" WHERE r.id=? AND r.student_id=?",n(candidate,"run_id"),n(candidate,"student_id"));if(records.isEmpty())return;
            var run=db.row(records.getFirst());var row=owned(run,s(candidate,"public_id"));if(!s(row,"status").equals("PENDING"))return;
            if((run.kind().equals("DEMO")&&!db.demoEnabled())||!s(accounts.getFirst(),"status").equals("ACTIVE")||!run.status().equals("IN_PROGRESS")||n(runs.stepState(run,s(row,"step_key")),"current_revision")!=n(row,"input_revision")){failPending(row);return;}
            try {
                var version=runs.version(run);var output=fallback(version,s(row,"step_key"),(int)n(row,"hint_level"),staticHint(runs.stepDefinition(run,s(row,"step_key")),(int)n(row,"hint_level")));db.jdbc().update("UPDATE mp_hint_request SET status='FALLBACK',response_json=?,provider='STATIC',model=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='PENDING'",db.json(output.response()),n(row,"id"));
            } catch(ApiException unavailable) {
                // An unavailable/corrupt pinned definition must not strand this or later tickets.
                failPending(row);
            }
        });
    }
    private void failPending(Map<String,Object> row) {db.jdbc().update("UPDATE mp_hint_request SET status='FAILED',response_json=NULL,completed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='PENDING'",n(row,"id"));}
}
