package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.datascience.DsSemantics;
import com.ruoyi.majorpilot.businessanalytics.BaSemantics;
import com.ruoyi.majorpilot.acceptance.LocalProductAccess;
import com.ruoyi.majorpilot.acceptance.ProductEligibility;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import static com.ruoyi.majorpilot.experience.RunStore.*;

@Service @Profile("local")
public class RunService {
    private final RunStore db;private final TaskContentProvider content;private final IdempotencyService idem;private final TransactionTemplate tx;
    private LocalProductAccess local;
    @Autowired public void localProductAccess(LocalProductAccess local){this.local=local;}
    public RunService(RunStore db,TaskContentProvider content,IdempotencyService idem,TransactionTemplate tx) {this.db=db;this.content=content;this.idem=idem;this.tx=tx;}
    public RunStore store() {return db;}
    public TaskContentProvider contentProvider() {return content;}
    public IdempotencyService idempotency() {return idem;}
    public TransactionTemplate transactions() {return tx;}
    String recordAiCall(Row run,String kind,JsonNode safe,HintProvider.Result output,long elapsed){
        return tx.execute(status->{var account=db.jdbc().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",run.studentId());if(account.isEmpty()||!"ACTIVE".equals(s(account.getFirst(),"status")))return null;
            var telemetry=output==null?null:output.telemetry();var fields=telemetry==null?List.<String>of():telemetry.inputFieldKeys();String provider=output==null?"UNAVAILABLE":telemetry!=null&&telemetry.httpAttempts()>0&&output.model()!=null?"BAILIAN":output.provider();
            String id=PublicIds.next();db.jdbc().update("INSERT INTO mp_ai_call(public_id,student_id,experience_run_id,call_kind,provider,model,prompt_version,input_schema_version,input_sha256,input_field_keys_json,status,duration_ms,http_attempts,repair_attempts,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,run.studentId(),run.id(),kind,provider,output==null?null:output.model(),output==null?(kind.equals("HINT")?"task-hint-v1":"reflection-follow-up-v1"):output.promptVersion(),kind.equals("HINT")?"hint-context-v1":"reflection-context-v1",db.hash(safe),db.json(fields),output==null?"FAILED":output.status(),Math.max(0,elapsed),telemetry==null?null:telemetry.httpAttempts(),telemetry==null?null:telemetry.repairAttempts(),telemetry==null?null:telemetry.errorCode());return id;
        });
    }
    public List<Map<String,Object>> demos(StudentPrincipal student) {
        if(!db.demoEnabled())throw new ApiException(404,"RESOURCE_NOT_FOUND");
        return tx.execute(status->{db.activeStudent(student);var result=new ArrayList<Map<String,Object>>();
            for(String key:List.of("DEMO_TABLE","DEMO_COMPARE")){try{var version=content.currentDemo(key);result.add(map("demoKey",key,"title",version.manifest().path("title").asText(),"contentKind","DEMO","versionCode",version.versionCode(),"availability","AVAILABLE"));}catch(ApiException unavailable){if(unavailable.status!=404)throw unavailable;}}
            return result;});
    }
    public List<Map<String,Object>> previews(StudentPrincipal student) {
        if(!db.previewEnabled()||local!=null&&local.enabled())throw new ApiException(404,"RESOURCE_NOT_FOUND");
        return tx.execute(status->{db.activeStudent(student);return content.reviewVersions().stream().map(v->map("taskVersionId",v.taskVersionId(),"majorCode",v.majorCode(),"title",v.manifest().path("title").asText(),"versionCode",v.versionCode(),"runMode","REVIEW_PREVIEW","reviewStatus","REVIEW","warning","工程预览；尚待专业审核与真实用户计时")).toList();});
    }
    public RunDtos.Run createPreview(StudentPrincipal student,String key,RunDtos.CreatePreview input) {
        if(!db.previewEnabled()||local!=null&&local.enabled())throw new ApiException(404,"RESOURCE_NOT_FOUND");
        return write(student,"/review-preview-runs",key,input,RunDtos.Run.class,()->{
            if(!db.previewEnabled())throw new ApiException(404,"RESOURCE_NOT_FOUND");var v=content.review(input.taskVersionId());
            var majors=db.jdbc().queryForList("SELECT id FROM mp_major WHERE code=? AND status='ACTIVE'",v.majorCode());if(majors.isEmpty())throw new ApiException(404,"CONTENT_UNAVAILABLE");long major=n(majors.getFirst(),"id");
            var existing=db.jdbc().queryForList(SELECT+" WHERE r.student_id=? AND r.lane_key=? AND r.status<>'REPLACED'",student.internalId(),"preview:"+major+":"+v.internalId());if(!existing.isEmpty())return db.view(db.row(existing.getFirst()));
            String id=PublicIds.next();db.jdbc().update("INSERT INTO mp_experience_run(public_id,student_id,content_kind,run_mode,major_id,task_version_id) VALUES(?,?,'MAJOR','REVIEW_PREVIEW',?,?)",id,student.internalId(),major,v.internalId());var run=db.owned(student,id);db.event(run,"run.created",Map.of("contentKind","MAJOR"));return db.view(run);
        });
    }
    public List<RunDtos.Run> list(StudentPrincipal student) {return tx.execute(status->{db.activeStudent(student);return db.jdbc().queryForList(RunStore.SELECT+" WHERE r.student_id=? ORDER BY r.id",student.internalId()).stream().map(db::row).filter(r->(db.demoEnabled()||r.kind().equals("MAJOR"))&&(db.previewEnabled()||!r.mode().equals("REVIEW_PREVIEW")||db.productEligible(r))).map(db::view).toList();});}
    public RunDtos.Run get(StudentPrincipal student,String id) {return tx.execute(status->{db.activeStudent(student);return db.view(db.owned(student,id));});}
    IdempotencyService.Owner owner(StudentPrincipal student) {return new IdempotencyService.Owner(student.internalId(),null,"student:"+student.publicId());}
    <T>T write(StudentPrincipal student,String path,String key,Object request,Class<T> type,java.util.function.Supplier<T> action) {
        return idem.execute(owner(student),"POST","/api/app/v1"+path,key,request,type,()->{db.activeStudent(student);return action.get();}).data();
    }
    <T>T writeOwned(StudentPrincipal student,String id,String path,String key,Object request,Class<T> type,java.util.function.Supplier<T> action) {
        // Current authorization and feature availability precede replay; lifecycle/revision do not.
        tx.executeWithoutResult(status->{db.activeStudent(student);db.owned(student,id);});
        return write(student,path,key,request,type,action);
    }
    public RunDtos.Run create(StudentPrincipal student,String key,RunDtos.Create input) {
        if((input.decisionId()==null)==(input.demoKey()==null))throw new ApiException(422,"VALIDATION_ERROR");
        if(input.demoKey()!=null&&!db.demoEnabled())throw new ApiException(404,"RESOURCE_NOT_FOUND");
        return write(student,"/experience-runs",key,input,RunDtos.Run.class,()->{
            Long major=null,recommendation=null,decision=null;String kind=input.demoKey()==null?"MAJOR":"DEMO",demo=input.demoKey();
            if(kind.equals("DEMO")){if(!db.demoEnabled())throw new ApiException(404,"RESOURCE_NOT_FOUND");content.currentDemo(demo);}
            else {var choices=db.jdbc().queryForList("SELECT d.id,d.recommendation_id,m.id AS major_id FROM mp_recommendation_decision d JOIN mp_major m ON m.code=d.selected_major_code WHERE d.public_id=? AND d.student_id=? AND m.status='ACTIVE'",input.decisionId(),student.internalId());if(choices.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");var choice=choices.getFirst();major=n(choice,"major_id");decision=n(choice,"id");recommendation=n(choice,"recommendation_id");}
            String lane=kind.equals("MAJOR")?"major:"+major:"demo:"+demo;
            if(kind.equals("MAJOR")){
                var adopted=db.jdbc().queryForList(RunStore.SELECT+" WHERE r.student_id=? AND r.major_id=? AND r.run_mode='REVIEW_PREVIEW' AND "+ProductEligibility.sql("r"),student.internalId(),major);
                if(!adopted.isEmpty())return db.view(db.row(adopted.getFirst()));
            }
            var existing=db.jdbc().queryForList(RunStore.SELECT+" WHERE r.student_id=? AND r.lane_key=? AND r.status<>'REPLACED'",student.internalId(),lane);
            if(!existing.isEmpty()) {var run=db.row(existing.getFirst());
                if(run.status().equals("READY")&&run.origin()==null&&!Objects.equals(run.decisionId(),decision)){db.revision(run,input.expectedRevision());db.jdbc().update("UPDATE mp_experience_run SET source_decision_id=?,source_recommendation_id=?,row_version=row_version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?",decision,recommendation,run.id());}
                return db.view(db.internal(run.id()));
            }
            String id=PublicIds.next();db.jdbc().update("INSERT INTO mp_experience_run(public_id,student_id,content_kind,major_id,demo_key,source_recommendation_id,source_decision_id) VALUES(?,?,?,?,?,?,?)",id,student.internalId(),kind,major,demo,recommendation,decision);
            var run=db.owned(student,id);db.event(run,"run.created",Map.of("contentKind",kind));return db.view(run);
        });
    }
    public RunDtos.Run transition(StudentPrincipal student,String id,String operation,String key,RunDtos.Transition input) {
        if(!Set.of("start","resume","pause").contains(operation))throw new IllegalArgumentException("Unknown transition");
        if((input.pauseActiveRunId()==null)!=(input.expectedActiveRunRevision()==null)||operation.equals("pause")&&input.pauseActiveRunId()!=null)throw new ApiException(422,"VALIDATION_ERROR");
        return writeOwned(student,id,"/experience-runs/"+id+"/"+operation,key,input,RunDtos.Run.class,()->{
            var run=db.owned(student,id);db.revision(run,input.expectedRevision());
            if(operation.equals("pause")){if(!Set.of("IN_PROGRESS","TASK_COMPLETED").contains(run.status()))writable(run,"IN_PROGRESS");pause(run);return db.view(db.internal(run.id()));}
            String required=operation.equals("start")?"READY":"PAUSED";if(!run.status().equals(required))writable(run,required);
            var active=db.activeRun(student.internalId());
            if(active!=null){if(!active.publicId().equals(input.pauseActiveRunId()))throw new ApiException(409,"ACTIVE_RUN_EXISTS",Map.of("activeRunId",active.publicId(),"currentRevision",active.revision()));db.revision(active,input.expectedActiveRunRevision());}
            else if(input.pauseActiveRunId()!=null)throw new ApiException(409,"RUN_REVISION_CONFLICT");
            // Validate/pin the target before changing the current active slot. Any later error still rolls back both.
            TaskContent.Version version=null;Long profile=run.profileId();
            if(operation.equals("start")) {
                version=run.taskPublicId()!=null?pinned(run):run.kind().equals("DEMO")?content.currentDemo(run.demoKey()):content.currentMajor(run.majorCode());
                var locked=db.jdbc().queryForList("SELECT status FROM mp_task_version WHERE id=? FOR UPDATE",version.internalId());
                if(locked.isEmpty()||run.taskPublicId()==null&&!(local==null?"PUBLISHED".equals(s(locked.getFirst(),"status")):local.canStart(version.internalId())))throw new ApiException(409,"TASK_VERSION_UNAVAILABLE");
                if(profile==null){var profiles=run.kind().equals("DEMO")||run.mode().equals("REVIEW_PREVIEW")?db.jdbc().queryForList("SELECT id FROM mp_decision_profile WHERE student_id=? ORDER BY profile_version_no DESC LIMIT 1",student.internalId()):db.jdbc().queryForList("SELECT decision_profile_id AS id FROM mp_recommendation WHERE id=? AND student_id=?",run.recommendationId(),student.internalId());if(profiles.isEmpty())throw new ApiException(422,"DECISION_PROFILE_INVALID");profile=n(profiles.getFirst(),"id");}
            } else pinned(run);
            if(active!=null)pause(active);
            if(operation.equals("start")) {
                String first=version.manifest().path("steps").get(0).path("stepKey").asText();
                db.jdbc().update("UPDATE mp_experience_run SET status='IN_PROGRESS',task_version_id=?,decision_profile_id=?,current_step_key=?,started_at=UTC_TIMESTAMP(3),last_activity_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",version.internalId(),profile,first,run.id());
                for(var step:version.manifest().path("steps"))db.jdbc().update("INSERT INTO mp_step_state(experience_run_id,step_key) VALUES(?,?)",run.id(),step.path("stepKey").asText());
                db.event(db.internal(run.id()),"run.started",Map.of("taskVersion",version.versionCode()));
            } else {
                db.jdbc().update("UPDATE mp_experience_run SET status=paused_from_status,paused_from_status=NULL,paused_at=NULL,last_activity_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",run.id());
                db.event(db.internal(run.id()),"run.reactivated",map("resumedStatus",run.pausedFrom(),"stepKey",run.currentStep()));
            }
            return db.view(db.internal(run.id()));
        });
    }
    private void pause(Row run) {db.jdbc().update("UPDATE mp_experience_run SET paused_from_status=status,status='PAUSED',paused_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",run.id());db.event(run,"run.paused",map("pausedFromStatus",run.status(),"stepKey",run.currentStep()));}
    public JsonNode task(StudentPrincipal student,String id) {return tx.execute(status->{db.activeStudent(student);var run=db.owned(student,id);return TaskContentViews.publicManifest(version(run));});}
    TaskContent.Version pinned(Row run) {return run.mode().equals("REVIEW_PREVIEW")&&!db.productEligible(run)?content.pinnedForPreview(run.taskPublicId()):content.pinned(run.taskPublicId());}
    TaskContent.Version version(Row run) {if(run.status().equals("REPLACED"))throw new ApiException(409,"RUN_REPLACED");if(run.taskPublicId()==null)throw new ApiException(409,"RUN_STATE_INVALID");return pinned(run);}
    JsonNode stepDefinition(Row run,String key) {for(var step:version(run).manifest().path("steps"))if(step.path("stepKey").asText().equals(key))return step;throw new ApiException(404,"STEP_NOT_AVAILABLE");}
    Map<String,Object> stepState(Row run,String key) {var rows=db.jdbc().queryForList("SELECT * FROM mp_step_state WHERE experience_run_id=? AND step_key=?",run.id(),key);if(rows.isEmpty())throw new ApiException(404,"STEP_NOT_AVAILABLE");return rows.getFirst();}
    void dependencies(Row run,JsonNode definition) {for(var dependency:definition.path("dependencies")){var state=stepState(run,dependency.asText());if(!s(state,"status").equals("COMPLETED"))throw new ApiException(409,"STEP_NOT_AVAILABLE");}}
    JsonNode response(Map<String,Object> step) {if(n(step,"current_revision")==0)return db.mapper().createObjectNode();return db.node(db.jdbc().queryForObject("SELECT response_json FROM mp_step_response_revision WHERE step_state_id=? AND revision_no=?",String.class,n(step,"id"),n(step,"current_revision")));}
    JsonNode operation(Row run,String key) {for(var op:version(run).manifest().path("operations"))if(op.path("operationKey").asText().equals(key))return op;throw new ApiException(422,"EXECUTION_NOT_ALLOWED");}
    ExecutionBindings.Bound bound(Row run,JsonNode operation,JsonNode ownResponse){return new ExecutionBindings(this).resolve(run,operation,ownResponse);}
    List<RunDtos.InputBinding> bindings(Row run,JsonNode operation) {return bound(run,operation,null).ancestors();}
    void validateParameters(JsonNode operation,JsonNode parameters){ResponseRules.validate(operation.path("parametersSchema"),parameters,true);if(operation.path("engineType").asText().equals("DATA_ANALYSIS"))DsSemantics.validate(operation.path("operationKey").asText(),parameters);if(operation.path("engineType").asText().equals("BUSINESS_ANALYSIS"))BaSemantics.validate(operation.path("operationKey").asText(),parameters);}
    ExecutionBindings.Bound validatedParameters(Row run,JsonNode operation,JsonNode ownResponse){var bound=bound(run,operation,ownResponse);validateParameters(operation,bound.parameters());return bound;}
    Map<String,Long> sources(List<RunDtos.InputBinding> bindings) {var result=new TreeMap<String,Long>();for(var binding:bindings)result.put(binding.sourceStepKey(),binding.sourceRevision());return result;}
    String bindingHash(Map<String,Long> sources) {return Secrets.hash(db.json(new TreeMap<>(sources)));}
    Map<String,Long> sourceMap(Object json) {var result=new TreeMap<String,Long>();db.node(json).fields().forEachRemaining(e->result.put(e.getKey(),e.getValue().asLong()));return result;}
    public RunDtos.Step step(StudentPrincipal student,String id,String key) {return tx.execute(status->{db.activeStudent(student);var run=db.owned(student,id);var definition=stepDefinition(run,key);dependencies(run,definition);var state=stepState(run,key);var operationKey=definition.path("operationKey").asText("");var bound=operationKey.isBlank()?List.<RunDtos.InputBinding>of():bindings(run,operation(run,operationKey));return new RunDtos.Step(key,s(state,"status"),n(state,"current_revision"),definition.path("responseSchemaVersion").asText(),response(state),TaskContentViews.publicStep(definition),!run.status().equals("IN_PROGRESS"),time(state,"last_saved_at"),executions(run,key),bound,ba(run)&&key.equals("b6-action")?baContext(run).view():null);});}
    public RunDtos.Saved save(StudentPrincipal student,String id,String key,RunDtos.Save input) {return tx.execute(status->{
        db.activeStudent(student);var run=db.owned(student,id);writable(run,"IN_PROGRESS");var definition=stepDefinition(run,key);dependencies(run,definition);var state=stepState(run,key);expected(input.expectedRevision());
        if(n(state,"current_revision")!=input.expectedRevision())throw new ApiException(409,"STEP_REVISION_CONFLICT",Map.of("currentRevision",n(state,"current_revision")));
        if(!definition.path("responseSchemaVersion").asText().equals(input.responseSchemaVersion()))throw new ApiException(422,"STEP_VALIDATION_FAILED");
        ResponseRules.validate(definition.path("inputSchema"),input.response(),false);long revision=input.expectedRevision()+1;String json=db.json(input.response());
        db.jdbc().update("INSERT INTO mp_step_response_revision(step_state_id,revision_no,response_schema_version,response_json,content_sha256) VALUES(?,?,?,?,?)",n(state,"id"),revision,input.responseSchemaVersion(),json,Secrets.hash(json));
        List<String> invalidated=List.of();
        if(s(state,"status").equals("COMPLETED")){
            invalidated=dependentSteps(version(run).manifest().path("steps"),key);
            for(String affected:invalidated)db.jdbc().update("UPDATE mp_step_state SET status=CASE WHEN current_revision=0 THEN 'NOT_STARTED' ELSE 'IN_PROGRESS' END,completed_at=NULL,row_version=row_version+1 WHERE experience_run_id=? AND step_key=?",run.id(),affected);
        }
        db.jdbc().update("UPDATE mp_step_state SET status='IN_PROGRESS',current_revision=?,first_started_at=COALESCE(first_started_at,UTC_TIMESTAMP(3)),last_saved_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",revision,n(state,"id"));db.touch(run,key);
        db.event(run,"response.saved",Map.of("stepKey",key,"revision",revision,"responseType",input.responseSchemaVersion()));
        return new RunDtos.Saved(key,revision,run.revision()+1,Instant.now(),"VALID",invalidated);
    });}
    public RunDtos.Run completeStep(StudentPrincipal student,String id,String key,String idemKey,RunDtos.Revision input) {return completeStep(student,id,key,idemKey,new RunDtos.StepCompletion(input.expectedRevision()));}
    public RunDtos.Run completeStep(StudentPrincipal student,String id,String key,String idemKey,RunDtos.StepCompletion input) {return writeOwned(student,id,"/experience-runs/"+id+"/steps/"+key+"/complete",idemKey,input,RunDtos.Run.class,()->{
        var run=db.owned(student,id);writable(run,"IN_PROGRESS");var definition=stepDefinition(run,key);dependencies(run,definition);var state=stepState(run,key);expected(input.expectedRevision());
        if(n(state,"current_revision")!=input.expectedRevision())throw new ApiException(409,"STEP_REVISION_CONFLICT",Map.of("currentRevision",n(state,"current_revision")));
        if(ba(run)&&key.equals("b6-action"))checkActionSources(input.expectedSourceRevisions(),baSources(run));
        if(s(state,"status").equals("COMPLETED"))return db.view(run);
        ResponseRules.validate(definition.path("inputSchema"),response(state),true);
        if(ba(run)&&key.equals("b4-segment"))baPriority(response(state));
        if(ba(run)&&key.equals("b6-action")){
            var context=baContext(run);var action=db.mapper().createObjectNode();var answer=response(state);
            for(String field:List.of("targetSegmentKey","successMetric","targetChangePercentagePoints","guardrailMetric","guardrailMaximum","reviewAfterDays"))if(answer.has(field))action.set(field,answer.get(field));
            BaSemantics.validateAction(action,context.parameters(),context.priority(),context.result());
        }
        String operation=definition.path("operationKey").asText("");
        if(!operation.isBlank()){
            var bound=validatedParameters(run,operation(run,operation),response(state));
            if(currentExecutionRecord(run,state,operation,bound.sources())==null)throw new ApiException(422,"EXECUTION_NOT_ALLOWED");
        }
        db.jdbc().update("INSERT IGNORE INTO mp_step_completion(public_id,step_state_id,response_revision) VALUES(?,?,?)",PublicIds.next(),n(state,"id"),n(state,"current_revision"));
        db.jdbc().update("UPDATE mp_step_state SET status='COMPLETED',completed_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",n(state,"id"));db.touch(run,nextStep(run,key));db.event(run,"step.completed",Map.of("stepKey",key));return db.view(db.internal(run.id()));
    });}
    private boolean ba(Row run){return "BUSINESS_ANALYTICS".equals(run.majorCode())&&version(run).manifest().path("schemaVersion").asText().equals("task-manifest-v4");}
    private static final Set<String> BA_SOURCES=Set.of("b2-metric","b3-funnel","b4-segment");
    private Map<String,Long> baSources(Row run){var result=new TreeMap<String,Long>();for(String key:BA_SOURCES)result.put(key,n(stepState(run,key),"current_revision"));return Collections.unmodifiableMap(result);}
    static void checkActionSources(Map<String,Long> expected,Map<String,Long> actual){
        if(expected==null||!expected.keySet().equals(BA_SOURCES)||expected.values().stream().anyMatch(value->value==null||value<1))throw new ApiException(422,"STEP_VALIDATION_FAILED");
        if(!expected.equals(actual))throw new ApiException(409,"STEP_SOURCE_REVISION_CONFLICT",Map.of("currentSourceRevisions",actual));
    }
    private String baPriority(JsonNode response){
        String dimension=response.path("segmentBy").asText(),priority=response.path("prioritySegmentKey").asText();
        var allowed=BaSemantics.GROUPS.getOrDefault(dimension,List.of());
        if(!allowed.contains(priority))throw new ApiException(422,"BA_PARAMETERS_INVALID");return priority;
    }
    private record BaContext(JsonNode parameters,String priority,JsonNode result,RunDtos.BaActionContext view) {}
    /** Caller holds the Student lock; load all baseline fields and provenance from this one transaction. */
    private BaContext baContext(Row run){
        var state=stepState(run,"b4-segment");if(!s(state,"status").equals("COMPLETED"))throw new ApiException(409,"EXECUTION_REVISION_STALE");
        var answer=response(state);String priority=baPriority(answer);var parameters=validatedParameters(run,operation(run,"ba-segments"),answer).parameters();
        var current=currentExecution(run,"b4-segment");if(current==null||!current.status().equals("SUCCEEDED")||!current.trustLevel().equals("SERVER_VERIFIED"))throw new ApiException(409,"EXECUTION_REVISION_STALE");
        var result=current.result();try{ResponseRules.validate(operation(run,"ba-segments").path("resultSchema"),result,true);}catch(ApiException invalid){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
        for(String field:List.of("numerator","denominator","segmentBy","focusTransitionKey"))if(!result.path(field).equals(parameters.path(field)))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");
        for(String period:List.of("baseline","comparison"))for(String edge:List.of("Start","End"))if(result.path("windows").path(period).path(edge.toLowerCase(Locale.ROOT)+"Week").asInt(-1)!=parameters.path(period+edge+"Week").asInt(-2))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");
        JsonNode comparison=null;for(var segment:result.path("segments"))if(segment.path("segmentKey").asText().equals(priority))comparison=segment.path("comparison");
        if(comparison==null||!comparison.isObject())throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");
        return new BaContext(parameters,priority,result,new RunDtos.BaActionContext(parameters.deepCopy(),priority,comparison.deepCopy(),baSources(run)));
    }
    String nextStep(Row run,String current) {for(var definition:version(run).manifest().path("steps")){var state=stepState(run,definition.path("stepKey").asText());if(!s(state,"status").equals("COMPLETED"))return definition.path("stepKey").asText();}return current;}
    static List<String> dependentSteps(JsonNode definitions,String changed) {
        Set<String> affected=new LinkedHashSet<>();affected.add(changed);boolean expanded;
        do{expanded=false;for(var step:definitions){String key=step.path("stepKey").asText();if(affected.contains(key))continue;for(var dependency:step.path("dependencies"))if(affected.contains(dependency.asText())){affected.add(key);expanded=true;break;}}}while(expanded);
        return List.copyOf(affected);
    }
    public RunDtos.Run taskComplete(StudentPrincipal student,String id,String key,RunDtos.Revision input) {return writeOwned(student,id,"/experience-runs/"+id+"/task-completion",key,input,RunDtos.Run.class,()->{
        var run=db.owned(student,id);db.revision(run,input.expectedRevision());writable(run,"IN_PROGRESS");var manifest=version(run).manifest();for(var definition:manifest.path("steps"))if(definition.path("required").asBoolean(true)&&!s(stepState(run,definition.path("stepKey").asText()),"status").equals("COMPLETED"))throw new ApiException(422,"STEP_VALIDATION_FAILED");
        db.jdbc().update("UPDATE mp_experience_run SET status='TASK_COMPLETED',task_completed_at=UTC_TIMESTAMP(3),last_activity_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",run.id());
        db.jdbc().update("INSERT INTO mp_reflection(public_id,experience_run_id,question_set_version,draft_json) VALUES(?,?,?,'{}')",PublicIds.next(),run.id(),manifest.path("reflection").path("questionSetVersion").asText());db.event(run,"task.completed",Map.of());return db.view(db.internal(run.id()));
    });}
    private Map<String,Object> currentExecutionRecord(Row run,Map<String,Object> state,String operation,Map<String,Long> sources) {
        var rows=db.jdbc().queryForList("SELECT e.* FROM mp_response_execution x JOIN mp_step_response_revision r ON r.id=x.response_revision_id JOIN mp_execution_record e ON e.id=x.execution_record_id WHERE r.step_state_id=? AND r.revision_no=? AND e.experience_run_id=? AND e.step_key=? AND e.status='SUCCEEDED' AND e.trust_level='SERVER_VERIFIED' AND e.operation_key=? AND x.source_binding_sha256=? ORDER BY e.id DESC LIMIT 1",n(state,"id"),n(state,"current_revision"),run.id(),s(state,"step_key"),operation,bindingHash(sources));
        return rows.isEmpty()?null:rows.getFirst();
    }
    private int remainingEvaluations(Row run,String key) {
        int used=db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_execution_record WHERE experience_run_id=? AND operation_key=? AND evaluation_config_sha256 IS NOT NULL AND counts_against_quota=TRUE",Integer.class,run.id(),key);
        return Math.max(0,operation(run,key).path("maxEvaluations").asInt(5)-used);
    }
    /** Current business state is selected by its exact own/source binding, never by a history page. */
    RunDtos.Execution currentExecution(Row run,String step) {
        String key=stepDefinition(run,step).path("operationKey").asText("");if(key.isBlank())return null;
        var state=stepState(run,step);if(n(state,"current_revision")==0)return null;
        var bound=validatedParameters(run,operation(run,key),response(state));var record=currentExecutionRecord(run,state,key,bound.sources());
        return record==null?null:execution(record,false,remainingEvaluations(run,key),n(state,"current_revision"),bound.sources());
    }
    List<RunDtos.Execution> executions(Row run,String step) {
        RunDtos.Execution current=null;
        try{current=currentExecution(run,step);}catch(ApiException incomplete){if(!Set.of("STEP_VALIDATION_FAILED","DS_PARAMETERS_INVALID","BA_PARAMETERS_INVALID","EXECUTION_REVISION_STALE").contains(incomplete.code))throw incomplete;}
        var remaining=new HashMap<String,Integer>();var result=new ArrayList<RunDtos.Execution>();boolean included=false;
        for(var record:db.jdbc().queryForList("SELECT e.* FROM mp_execution_record e WHERE e.experience_run_id=? AND e.step_key=? ORDER BY e.id DESC LIMIT 50",run.id(),step)){
            if(current!=null&&current.executionId().equals(s(record,"public_id"))){result.add(current);included=true;}
            else result.add(execution(record,false,remaining.computeIfAbsent(s(record,"operation_key"),key->remainingEvaluations(run,key)),null,null));
        }
        // At most one explicitly current result accompanies the bounded historical page for this step.
        if(current!=null&&!included)result.add(current);
        return List.copyOf(result);
    }
    RunDtos.Execution execution(Map<String,Object> e,boolean reused,int remaining,Long appliedRevision,Map<String,Long> appliedSources) {return new RunDtos.Execution(s(e,"public_id"),s(e,"operation_key"),s(e,"step_key"),n(e,"input_revision"),appliedRevision,s(e,"status"),s(e,"trust_level"),db.node(e.get("result_json")),s(e,"error_code"),n(e,"duration_ms"),reused,Math.max(0,remaining),sourceMap(e.get("source_revisions_json")),appliedSources);}
    public RunDtos.Run recover(long operator,String id,String key,RunDtos.Recovery input,String correlation) {
        expected(input.expectedRevision());if(input.reasonCode()==null||!Set.of("CONTENT_ERROR","PROGRESS_CORRUPTION","TECHNICAL_FAILURE").contains(input.reasonCode())||input.reasonText()==null||input.reasonText().isBlank()||input.reasonText().length()>1000)throw new ApiException(422,"VALIDATION_ERROR");
        var owners=db.jdbc().queryForList("SELECT id,student_id FROM mp_experience_run WHERE public_id=?",id);if(owners.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");
        db.demoGate(db.internal(n(owners.getFirst(),"id")));
        return idem.execute(new IdempotencyService.Owner(n(owners.getFirst(),"student_id"),null,"operator:"+operator),"POST","/api/admin/v1/majorpilot/experience-runs/"+id+"/recovery-runs",key,input,RunDtos.Run.class,()->{
            var candidates=db.jdbc().queryForList(RunStore.SELECT+" WHERE r.public_id=?",id);if(candidates.isEmpty())throw new ApiException(404,"RESOURCE_NOT_FOUND");var run=db.row(candidates.getFirst());var account=db.jdbc().queryForMap("SELECT public_id,status FROM mp_student_account WHERE id=? FOR UPDATE",run.studentId());db.activeStudent(new StudentPrincipal(run.studentId(),s(account,"public_id"),s(account,"status")));run=db.internal(run.id());db.demoGate(run);db.revision(run,input.expectedRevision());
            if(Set.of("CLOSED","REPLACED").contains(run.status()))throw new ApiException(409,"RUN_STATE_INVALID");
            String newId=PublicIds.next();db.jdbc().update("UPDATE mp_experience_run SET status='REPLACED',paused_from_status=NULL,replaced_at=UTC_TIMESTAMP(3),row_version=row_version+1 WHERE id=?",run.id());
            db.jdbc().update("INSERT INTO mp_experience_run(public_id,student_id,content_kind,major_id,demo_key,task_version_id,source_recommendation_id,source_decision_id,decision_profile_id,attempt_no,origin_run_id,created_reason,run_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,'OPERATOR_RECOVERY',?)",newId,run.studentId(),run.kind(),run.majorId(),run.demoKey(),run.taskId(),run.recommendationId(),run.decisionId(),run.profileId(),run.attempt()+1,run.id(),run.mode());
            db.jdbc().update("INSERT INTO mp_sensitive_audit(public_id,operator_id,owner_student_id,action_code,target_type,target_public_id,reason_code,reason_text,before_summary_json,after_summary_json,correlation_id) VALUES(?,?,?,'EXPERIENCE_RECOVERY','EXPERIENCE_RUN',?,?,?,?,?,?)",PublicIds.next(),operator,run.studentId(),id,input.reasonCode(),input.reasonText(),db.json(map("status",run.status(),"revision",run.revision())),db.json(map("status","REPLACED","recoveryRunId",newId)),correlation);
            db.event(run,"run.replaced",Map.of("reasonCode",input.reasonCode()));return db.view(db.owned(new StudentPrincipal(run.studentId(),s(account,"public_id"),"ACTIVE"),newId));
        }).data();
    }
}
