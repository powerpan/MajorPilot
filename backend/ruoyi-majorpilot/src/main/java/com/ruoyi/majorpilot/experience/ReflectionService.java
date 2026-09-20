package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import static com.ruoyi.majorpilot.experience.RunStore.*;
@Service @Profile("local")
public class ReflectionService {
    private final RunService runs;private final RunStore db;private final ClosurePipeline closure;
    @Autowired public ReflectionService(RunService runs,ClosurePipeline closure){this.runs=runs;this.db=runs.store();this.closure=closure;}
    public ReflectionService(RunService runs){this(runs,new ClosurePipeline(runs));}
    public RunService runService() {return runs;}
    Map<String,Object> record(Row run) {
        var rows=db.jdbc().queryForList("SELECT * FROM mp_reflection WHERE experience_run_id=?",run.id());if(rows.isEmpty())throw new ApiException(409,"RUN_STATE_INVALID");
        var row=rows.getFirst();var followUp=db.node(row.get("follow_up_json"));
        if(followUp.path("status").asText().equals("PENDING")&&java.time.Instant.parse(followUp.path("requestedAt").asText()).isBefore(java.time.Instant.now().minusSeconds(45))){
            String failed=db.json(map("requestId",followUp.path("requestId").asText(),"status","FAILED","response",null));
            db.jdbc().update("UPDATE mp_reflection SET follow_up_json=? WHERE id=?",failed,n(row,"id"));row.put("follow_up_json",failed);
        }
        return row;
    }
    JsonNode definition(Row run) {return runs.version(run).manifest().path("reflection");}
    RunDtos.Reflection view(Row run,Map<String,Object> row) {var stored=db.node(row.get("follow_up_json"));JsonNode visible=stored.isNull()?stored:db.mapper().valueToTree(map("status",stored.path("status").asText(),"response",stored.path("response"),"canSkip",true));return new RunDtos.Reflection(s(row,"public_id"),s(row,"question_set_version"),s(row,"status"),n(row,"row_version"),db.node(row.get("draft_json")),definition(run),visible,!run.status().equals("TASK_COMPLETED"));}
    public RunDtos.Reflection get(StudentPrincipal student,String id) {return runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);if(!(Set.of("TASK_COMPLETED","CLOSED").contains(run.status())||run.status().equals("PAUSED")&&"TASK_COMPLETED".equals(run.pausedFrom())))throw new ApiException(409,run.status().equals("REPLACED")?"RUN_REPLACED":"RUN_STATE_INVALID");return view(run,record(run));});}
    void valid(Row run,Map<String,Object> row,RunDtos.ReflectionSave input,boolean complete) {
        expected(input.expectedRevision());if(n(row,"row_version")!=input.expectedRevision())throw new ApiException(409,"REFLECTION_REVISION_CONFLICT",Map.of("currentRevision",n(row,"row_version")));
        if(!s(row,"question_set_version").equals(input.questionSetVersion()))throw new ApiException(422,"REFLECTION_INCOMPLETE");
        try{ResponseRules.validate(definition(run).path("inputSchema"),input.answers(),complete);}catch(ApiException invalid){throw new ApiException(422,"REFLECTION_INCOMPLETE");}
        for(String field:List.of("interestingStepKeys","difficultySources")){var choices=input.answers().path(field);if(choices.isArray()&&choices.size()>1)for(var item:choices)if(item.asText().equals("NONE"))throw new ApiException(422,"REFLECTION_INCOMPLETE");}
        if(input.answers().has("aiFollowUp")&&!input.answers().path("aiFollowUp").asText().equals("SKIPPED")&&!db.node(row.get("follow_up_json")).path("status").asText().equals("SUCCEEDED"))throw new ApiException(422,"REFLECTION_INCOMPLETE");
    }
    public RunDtos.Reflection save(StudentPrincipal student,String id,RunDtos.ReflectionSave input) {return runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);writable(run,"TASK_COMPLETED");var row=record(run);valid(run,row,input,false);db.jdbc().update("UPDATE mp_reflection SET draft_json=?,row_version=row_version+1 WHERE id=?",db.json(input.answers()),n(row,"id"));return view(run,record(run));});}
    public RunDtos.Run submit(StudentPrincipal student,String id,String key,RunDtos.ReflectionSave input) {return runs.writeOwned(student,id,"/experience-runs/"+id+"/reflection/submission",key,input,RunDtos.Run.class,()->{
        var run=db.owned(student,id);writable(run,"TASK_COMPLETED");var row=record(run);valid(run,row,input,true);ObjectNode answers=input.answers().deepCopy();if(!answers.has("nextWorkStyle"))answers.put("nextWorkStyle","SKIPPED");if(!answers.has("aiFollowUp"))answers.put("aiFollowUp","SKIPPED");
        db.jdbc().update("UPDATE mp_reflection SET status='SUBMITTED',draft_json=?,submitted_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",db.json(answers),n(row,"id"));
        var fields=answers.fieldNames();while(fields.hasNext()){String field=fields.next();var answer=answers.get(field);db.jdbc().update("INSERT INTO mp_reflection_answer(reflection_id,question_key,answer_json,answer_text,answer_source,ai_question_text) VALUES(?,?,?,?,?,?)",n(row,"id"),field,db.json(answer),answer.isTextual()?answer.asText():null,field.equals("aiFollowUp")?"AI_FOLLOW_UP":"FIXED_QUESTION",field.equals("aiFollowUp")?db.node(row.get("follow_up_json")).path("response").path("question").asText(null):null);}
        var frozen=closure.freeze(run,row,answers);
        String manifest=db.json(frozen),hash=closure.hash(db.node(manifest));
        db.jdbc().update("UPDATE mp_experience_run SET status='CLOSED',reflection_completed_at=UTC_TIMESTAMP(3),closed_at=UTC_TIMESTAMP(3),last_activity_at=UTC_TIMESTAMP(3),closed_input_manifest_json=?,closed_input_sha256=?,row_version=row_version+1 WHERE id=?",manifest,hash,run.id());
        db.jdbc().update("INSERT INTO mp_run_closure_request(public_id,experience_run_id,closed_input_sha256,content_kind,status) VALUES(?,?,?,?,?)",PublicIds.next(),run.id(),hash,run.kind(),run.kind().equals("DEMO")?"DEMO_COMPLETE":"PENDING");
        closure.enqueue(db.internal(run.id()),answers);
        db.event(run,"reflection.submitted",Map.of("answeredCount",answers.size(),"optionalSkippedCount",(answers.path("nextWorkStyle").asText().equals("SKIPPED")?1:0)+(answers.path("aiFollowUp").asText().equals("SKIPPED")?1:0)));
        int max=db.jdbc().queryForObject("SELECT COALESCE(MAX(hint_level),0) FROM mp_hint_request WHERE experience_run_id=?",Integer.class,run.id());db.event(run,"run.closed",Map.of("hintLevelMax",max));return db.view(db.internal(run.id()));
    });}
}
