package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.security.RateLimits;
import java.time.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;
/** Optional follow-up has one successful question per Run, never a new required answer. */
@Service @Profile("local")
public class FollowUpService {
    private final ReflectionService reflection;private final RunService runs;private final RunStore db;private final HintProvider provider;private final RateLimits limits;
    public FollowUpService(ReflectionService reflection,HintProvider provider,RateLimits limits){this.reflection=reflection;this.runs=reflection.runService();this.db=runs.store();this.provider=provider;this.limits=limits;}
    public record Ticket(String requestId) {}
    RunDtos.FollowUp view(JsonNode value){return new RunDtos.FollowUp(value.path("status").asText("FAILED"),value.path("response"),true);}
    public RunDtos.FollowUp request(StudentPrincipal student,String id,String key,RunDtos.Revision input){
        runs.transactions().executeWithoutResult(status->{db.activeStudent(student);db.owned(student,id);});
        var ticket=runs.idempotency().execute(runs.owner(student),"POST","/api/app/v1/experience-runs/"+id+"/reflection/follow-up",key,input,Ticket.class,()->{
            db.activeStudent(student);var run=db.owned(student,id);writable(run,"TASK_COMPLETED");var row=reflection.record(run);expected(input.expectedRevision());if(n(row,"row_version")!=input.expectedRevision())throw new ApiException(409,"REFLECTION_REVISION_CONFLICT",Map.of("currentRevision",n(row,"row_version")));
            var existing=db.node(row.get("follow_up_json"));if(existing.path("status").asText().equals("SUCCEEDED")||existing.path("status").asText().equals("PENDING")&&Instant.parse(existing.path("requestedAt").asText()).isAfter(Instant.now().minusSeconds(45)))return new Ticket(existing.path("requestId").asText());
            limits.require("reflection-follow-up",student.publicId(),3,Duration.ofMinutes(1));String request=PublicIds.next();db.jdbc().update("UPDATE mp_reflection SET follow_up_json=? WHERE id=?",db.json(map("requestId",request,"status","PENDING","requestedAt",Instant.now().toString(),"inputRevision",input.expectedRevision())),n(row,"id"));return new Ticket(request);
        });
        var before=runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);return db.node(reflection.record(run).get("follow_up_json"));});
        if(ticket.replayed()||!before.path("requestId").asText().equals(ticket.data().requestId())||!before.path("status").asText().equals("PENDING"))return view(before);
        // A concurrent different key returning the same in-flight ticket must not issue another call.
        String claim=Secrets.hash(key);boolean claimed=runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);var row=reflection.record(run);var state=db.node(row.get("follow_up_json"));if(state.has("claim"))return false;var updated=state.deepCopy();((com.fasterxml.jackson.databind.node.ObjectNode)updated).put("claim",claim);db.jdbc().update("UPDATE mp_reflection SET follow_up_json=? WHERE id=?",db.json(updated),n(row,"id"));return true;});if(!claimed)return view(before);
        var context=runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);var row=reflection.record(run);var safe=db.mapper().createObjectNode();var answers=db.node(row.get("draft_json"));for(String field:List.of("continueSimilarWork","nextWorkStyle","interestingStepKeys","difficultySources"))if(answers.has(field))safe.set(field,answers.get(field));return new FollowContext(run,runs.version(run),safe);});
        HintProvider.Result generated=null;long begin=System.nanoTime();try{generated=provider.followUp(new HintProvider.Context(context.version.taskVersionId(),context.version.versionCode(),"reflection",1,"reflection-follow-up-v1",context.safe,"",context.run.kind().equals("DEMO"),context.run.mode()));}catch(RuntimeException unavailable){}
        runs.recordAiCall(context.run,"REFLECTION_FOLLOW_UP",context.safe,generated,(System.nanoTime()-begin)/1000000);
        JsonNode response=generated==null?null:generated.response();boolean valid=generated!=null&&"SUCCEEDED".equals(generated.status())&&response!=null&&response.isObject()&&response.size()==1&&response.path("question").isTextual()&&!response.path("question").asText().isBlank()&&response.path("question").asText().length()<=500;
        final JsonNode result=valid?response:null;
        return runs.transactions().execute(status->{db.activeStudent(student);var run=db.owned(student,id);var row=reflection.record(run);var state=db.node(row.get("follow_up_json"));if(!state.path("requestId").asText().equals(ticket.data().requestId()))return view(state);
            boolean success=result!=null&&run.status().equals("TASK_COMPLETED")&&n(row,"row_version")==input.expectedRevision();var finished=db.mapper().valueToTree(map("requestId",ticket.data().requestId(),"status",success?"SUCCEEDED":"FAILED","response",success?result:null));db.jdbc().update("UPDATE mp_reflection SET follow_up_json=? WHERE id=?",db.json(finished),n(row,"id"));return view(finished);});
    }
    record FollowContext(Row run,com.ruoyi.majorpilot.content.TaskContent.Version version,JsonNode safe){}
}
