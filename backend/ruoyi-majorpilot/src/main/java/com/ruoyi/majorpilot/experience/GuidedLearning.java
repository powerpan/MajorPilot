package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.learning.*;
import com.ruoyi.majorpilot.shared.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;

/** All writes run under the existing Student lock and idempotency boundary. No browser time or answer is trusted. */
@Service @Profile({"local","pilot"})
public class GuidedLearning {
    private final RunStore db; private final TaskContentProvider content; private final WorkbookCatalog workbooks;
    public GuidedLearning(RunStore db, TaskContentProvider content, WorkbookCatalog workbooks) { this.db=db; this.content=content; this.workbooks=workbooks; }
    public boolean enabled(Row run) { return run.taskPublicId()!=null && MethodGuide.enabled(task(run).manifest()); }
    TaskContent.Version task(Row run) { return content.pinned(run.taskPublicId()); }
    public JsonNode guide(Row run) { if(!enabled(run))throw new ApiException(404,"RESOURCE_NOT_FOUND");try { return db.mapper().readTree(content.publicAsset(task(run),"method-guide").bytes()); } catch(ApiException e){throw e;} catch(Exception e){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");} }
    LearningTimeline.Binding binding(Row run, LearningTimeline.Definition d) { return new LearningTimeline.Binding(run.publicId(),run.taskPublicId(),task(run).manifestSha256(),LearningTimeline.definitionHash(d)); }
    List<LearningTimeline.Event> events(Row run) {
        var node=db.node(db.jdbc().queryForObject("SELECT learning_events_json FROM mp_experience_run WHERE id=?",String.class,run.id()));
        if(node.isNull())return List.of();
        try { return List.of(db.mapper().treeToValue(node,LearningTimeline.Event[].class)); } catch(Exception e){throw new ApiException(409,"LEARNING_SOURCE_INVALID");}
    }
    ArrayNode localResults(Row run) { var n=db.node(db.jdbc().queryForObject("SELECT local_results_json FROM mp_experience_run WHERE id=?",String.class,run.id()));if(n.isNull())return db.mapper().createArrayNode();if(!n.isArray())throw new ApiException(409,"LEARNING_SOURCE_INVALID");return (ArrayNode)n; }
    Map<String,Object> response(Row run,String step) { var states=db.jdbc().queryForList("SELECT s.current_revision,r.response_json FROM mp_step_state s LEFT JOIN mp_step_response_revision r ON r.step_state_id=s.id AND r.revision_no=s.current_revision WHERE s.experience_run_id=? AND s.step_key=?",run.id(),step);if(states.size()!=1)throw new ApiException(404,"STEP_NOT_AVAILABLE");return states.getFirst(); }
    public Map<String,Object> view(Row run) { var g=guide(run);var d=MethodGuide.definition(g);var e=events(run);LearningTimeline.validateHistory(binding(run,d),d,e);return map("guide",g,"sequence",e.size(),"events",e,"localResults",localResults(run),"workbooks",workbooks.list(task(run))); }
    public record Change(int expectedSequence,Long expectedStepRevision,String stepKey,String kind,String checkpointId,String supportId,String role) {}
    public Map<String,Object> change(Row run,Change input) {
        writable(run,"IN_PROGRESS");var g=guide(run);var d=MethodGuide.definition(g);var history=events(run);
        var checkpoint=d.checkpoints().stream().filter(c->c.checkpointId().equals(input.checkpointId())).findFirst().orElseThrow(()->new ApiException(422,"LEARNING_COMMAND_INVALID"));
        if(!Objects.equals(input.stepKey(),checkpoint.stepKey())&&!Objects.equals(input.stepKey(),checkpoint.transferStepKey()))throw new ApiException(422,"LEARNING_COMMAND_INVALID");
        final LearningTimeline.Kind kind;final LearningTimeline.Role role;
        try {kind=LearningTimeline.Kind.valueOf(input.kind());role=input.role()==null?null:LearningTimeline.Role.valueOf(input.role());}catch(Exception e){throw new ApiException(422,"LEARNING_COMMAND_INVALID");}
        JsonNode answer=null;Long revision=null;String sha=null;
        if(kind==LearningTimeline.Kind.ATTEMPT_SUBMITTED){
            var stored=response(run,input.stepKey());revision=n(stored,"current_revision");
            if(input.expectedStepRevision()==null||revision.longValue()!=input.expectedStepRevision())throw new ApiException(409,"STEP_REVISION_CONFLICT");
            answer=db.node(stored.get("response_json"));sha=LearningTimeline.answerHash(answer);
            if(role==LearningTimeline.Role.TRANSFER&&(answer.path("transferMode").asText().equals("SKIP")||answer.path("transfer").asText().isBlank()))throw new ApiException(422,"LEARNING_TRANSFER_REQUIRED");
            requireLocalCheck(run,input.stepKey(),answer,revision);
        } else if(input.role()!=null||input.expectedStepRevision()!=null) throw new ApiException(422,"LEARNING_COMMAND_INVALID");
        var command=new LearningTimeline.Command(kind,input.checkpointId(),role,answer,kind==LearningTimeline.Kind.ATTEMPT_SUBMITTED?input.stepKey():null,revision,sha,input.supportId());
        var event=LearningTimeline.append(binding(run,d),d,history,input.expectedSequence(),command,Instant.now().truncatedTo(ChronoUnit.MILLIS));
        var next=new ArrayList<>(history);next.add(event);db.jdbc().update("UPDATE mp_experience_run SET learning_events_json=? WHERE id=?",db.json(next),run.id());
        return view(run);
    }
    public record Check(String stepKey,Long expectedStepRevision,boolean assistance) {}
    public Map<String,Object> check(Row run,Check input) {
        writable(run,"IN_PROGRESS");var task=task(run);var g=guide(run);var definition=MethodGuide.step(g.path("steps"),input.stepKey());
        if(definition.path("local").isNull())throw new ApiException(422,"LOCAL_RESULT_INVALID");
        var stored=response(run,input.stepKey());long revision=n(stored,"current_revision");
        if(input.expectedStepRevision()==null||revision!=input.expectedStepRevision())throw new ApiException(409,"STEP_REVISION_CONFLICT");
        var answer=db.node(stored.get("response_json"));var local=answer.path("local");var spec=local.path("specification");
        TaskInputValidator.validate(definition.at("/local/specificationSchema"),spec,true);
        var assetKey=run.majorCode().equals("DATA_SCIENCE")?"learner-activity":"weekly-funnel";
        var asset=content.publicAsset(task,assetKey);JsonNode rows;
        try{rows=db.mapper().readTree(asset.bytes());}catch(Exception e){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
        var workbook=workbooks.list(task).getFirst();var basis=new LocalResultVerifier.Basis(task.taskVersionId(),workbook.workbookVersion(),workbook.sha256(),asset.sha256());
        var list=localResults(run);String answerSha=LearningTimeline.answerHash(local);
        for(var old:list)if(old.path("stepKey").asText().equals(input.stepKey())&&old.path("revision").asLong()==revision&&old.path("assistance").asBoolean()==input.assistance()&&old.path("answerSha256").asText().equals(answerSha))return map("record",old);
        if(list.size()>=40)throw new ApiException(409,"LOCAL_RESULT_LIMIT");
        var record=db.mapper().createObjectNode().put("id",PublicIds.next()).put("stepKey",input.stepKey()).put("revision",revision).put("assistance",input.assistance()).put("answerSha256",answerSha).put("acceptedAt",Instant.now().toString());
        if(input.assistance()) {
            record.put("interpretation","SYSTEM_RESULT_SELECTED_NOT_STUDENT_WORK");record.set("specification",spec.deepCopy());record.set("basis",db.mapper().valueToTree(basis));
            var values=record.putObject("calculated");LocalResultVerifier.calculate(run.majorCode(),spec,rows).forEach((key,value)->{var number=value.rounded(value.unit()==LocalResultVerifier.Unit.COUNT?0:2);values.put(key,number==null?"UNDEFINED":number.toPlainString());});
        } else {
            var values=new LinkedHashMap<String,String>();if(!local.path("values").isObject())throw new ApiException(422,"LOCAL_RESULT_INVALID");local.path("values").fields().forEachRemaining(e->values.put(e.getKey(),e.getValue().asText()));
            var submission=new LocalResultVerifier.Submission(local.path("workbookVersion").asText(),local.path("workbookSha256").asText(),local.path("method").asText(),spec,values,local.path("reason").asText());
            LocalResultVerifier.Result result;
            try{result=LocalResultVerifier.verify(run.majorCode(),basis,submission,rows);}catch(ApiException e){if(e.status!=503)throw e;result=LocalResultVerifier.unavailable(basis,submission);}
            record.set("result",db.mapper().valueToTree(result));
        }
        list.add(record);db.jdbc().update("UPDATE mp_experience_run SET local_results_json=? WHERE id=?",db.json(list),run.id());return map("record",record);
    }
    /** The ordinary completion endpoint cannot bypass explicit submissions or source-bound local checks. */
    public void requireCompletion(Row run,String step,JsonNode answer,long revision) {
        if(!enabled(run))return;
        var g=guide(run);var s=MethodGuide.step(g.path("steps"),step);String cp=s.path("checkpointId").asText(null),transfer=s.path("transferCheckpointId").asText(null);
        if(transfer!=null&&answer.path("transferMode").asText().equals("SKIP")){
            if(!answer.path("transfer").asText().isBlank()||events(run).stream().anyMatch(e->e.kind()==LearningTimeline.Kind.ATTEMPT_SUBMITTED&&e.payload().path("role").asText().equals("TRANSFER")))throw new ApiException(422,"LEARNING_SUBMISSION_REQUIRED");
            return; // Explicit saved choice, not a fabricated transfer attempt.
        }
        if(cp!=null||transfer!=null){
            var attempts=events(run).stream().filter(e->e.kind()==LearningTimeline.Kind.ATTEMPT_SUBMITTED&&e.checkpointId().equals(cp!=null?cp:transfer)&&e.payload().path("responseStepKey").asText().equals(step)).toList();
            if(attempts.isEmpty()||!attempts.getLast().payload().path("responseSha256").asText().equals(LearningTimeline.answerHash(answer)))throw new ApiException(422,"LEARNING_SUBMISSION_REQUIRED");
        }
        requireLocalCheck(run,step,answer,revision);
    }
    private void requireLocalCheck(Row run,String step,JsonNode answer,long revision){
        if(!answer.has("local"))return;
        String sha=LearningTimeline.answerHash(answer.path("local"));
        for(var r:localResults(run))if(!r.path("assistance").asBoolean()&&r.path("stepKey").asText().equals(step)&&r.path("answerSha256").asText().equals(sha)&&r.path("revision").asLong()<=revision)return;
        throw new ApiException(422,"LOCAL_RESULT_CHECK_REQUIRED");
    }
    public Map<String,Object> freeze(Row run){var g=guide(run);var d=MethodGuide.definition(g);return map("guide",g,"timeline",LearningTimeline.freeze(binding(run,d),d,events(run)),"localResults",localResults(run));}
}
