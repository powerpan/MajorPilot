package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.content.TaskContent;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.time.Duration;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;
@Service @Profile("local")
public class ExecutionService {
    private final RunService runs;private final RunStore db;private final ExecutionCalculator calculator;private final RateLimits limits;
    public ExecutionService(RunService runs,ExecutionCalculator calculator,RateLimits limits){this.runs=runs;this.db=runs.store();this.calculator=calculator;this.limits=limits;}
    record Plan(long studentId,String runId,String stepKey,long inputRevision,long responseId,String inputSha,TaskContent.Version version,JsonNode operation,JsonNode parameters,String configSha) {}
    public record Outcome(RunDtos.Execution execution,String errorCode) {}
    Plan prepare(StudentPrincipal student,String id,RunDtos.Execute input) {return runs.transactions().execute(status->{
        db.activeStudent(student);var run=db.owned(student,id);writable(run,"IN_PROGRESS");expected(input.inputRevision());var version=runs.version(run);JsonNode operation=null;
        for(var candidate:version.manifest().path("operations"))if(candidate.path("operationKey").asText().equals(input.operationKey()))operation=candidate;
        if(operation==null)throw new ApiException(422,"EXECUTION_NOT_ALLOWED");String stepKey=operation.path("stepKey").asText();var definition=runs.stepDefinition(run,stepKey);runs.dependencies(run,definition);var state=runs.stepState(run,stepKey);
        if(n(state,"current_revision")!=input.inputRevision()||input.inputRevision()==0)throw new ApiException(409,"EXECUTION_REVISION_STALE");
        var revision=db.jdbc().queryForMap("SELECT id,response_json,content_sha256 FROM mp_step_response_revision WHERE step_state_id=? AND revision_no=?",n(state,"id"),input.inputRevision());JsonNode response=db.node(revision.get("response_json"));var parameters=db.mapper().createObjectNode();var fields=operation.path("parametersSchema").path("properties").fieldNames();while(fields.hasNext()){String field=fields.next();if(response.has(field))parameters.set(field,response.get(field));}
        ResponseRules.validate(operation.path("parametersSchema"),parameters,true);
        if(input.parameters()!=null&&!input.parameters().isObject())throw new ApiException(422,"EXECUTION_NOT_ALLOWED");
        if(input.parameters()!=null&&!input.parameters().isEmpty()&&!input.parameters().equals(parameters))throw new ApiException(422,"EXECUTION_NOT_ALLOWED");
        String hash=s(revision,"content_sha256");if(input.inputSha256()!=null&&!Secrets.equal(input.inputSha256(),hash))throw new ApiException(409,"EXECUTION_REVISION_STALE");
        if(input.observedResult()!=null)ResponseRules.validate(operation.path("resultSchema"),input.observedResult(),true);
        var sorted=new TreeMap<String,JsonNode>();parameters.fields().forEachRemaining(entry->sorted.put(entry.getKey(),entry.getValue()));String config=Secrets.hash(version.taskVersionId()+"\0"+input.operationKey()+"\0"+db.json(sorted));
        return new Plan(student.internalId(),id,stepKey,input.inputRevision(),n(revision,"id"),hash,version,operation,parameters,config);
    });}
    public RunDtos.Execution execute(StudentPrincipal student,String id,String key,RunDtos.Execute input) {
        runs.transactions().executeWithoutResult(status->{db.activeStudent(student);db.owned(student,id);});
        var replay=runs.idempotency().replay(runs.owner(student),"POST","/api/app/v1/experience-runs/"+id+"/executions",key,input,Outcome.class);
        if(replay.isPresent())return finished(replay.get());
        // Rate limit precedes expensive work. It does not represent the durable successful-configuration quota.
        limits.require("experience-execution",student.publicId(),30,Duration.ofMinutes(1));Plan plan=prepare(student,id,input);long begin=System.nanoTime();JsonNode result=null;String computationError=null;
        try{result=calculator.calculate(plan.version,plan.operation,plan.parameters);if(result.toString().length()>102400)throw new ApiException(422,"EXECUTION_NOT_ALLOWED");ResponseRules.validate(plan.operation.path("resultSchema"),result,true);if(input.observedResult()!=null&&!equalNumbers(result,input.observedResult()))throw new ApiException(422,"EXECUTION_RESULT_MISMATCH");}
        catch(ApiException failure){computationError=failure.code;}
        long duration=(System.nanoTime()-begin)/1000000;if(duration>10000)computationError="EXECUTION_TIMED_OUT";
        final JsonNode finalResult=result;final String finalError=computationError;
        Outcome outcome=runs.write(student,"/experience-runs/"+id+"/executions",key,input,Outcome.class,()->{
            var run=db.owned(student,id);String stale=run.status().equals("PAUSED")?"RUN_PAUSED":!run.status().equals("IN_PROGRESS")?"RUN_STATE_INVALID":n(runs.stepState(run,plan.stepKey),"current_revision")!=plan.inputRevision?"EXECUTION_REVISION_STALE":null;
            if(stale==null)try{runs.dependencies(run,runs.stepDefinition(run,plan.stepKey));}catch(ApiException changed){stale="EXECUTION_REVISION_STALE";}
            int maximum=plan.operation.path("maxEvaluations").asInt(5);int used=db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_execution_record WHERE experience_run_id=? AND operation_key=? AND evaluation_config_sha256 IS NOT NULL",Integer.class,run.id(),input.operationKey());
            if(stale==null&&finalError==null){var reused=db.jdbc().queryForList("SELECT * FROM mp_execution_record WHERE experience_run_id=? AND operation_key=? AND evaluation_config_sha256=?",run.id(),input.operationKey(),plan.configSha);if(!reused.isEmpty()){db.jdbc().update("INSERT IGNORE INTO mp_response_execution(response_revision_id,execution_record_id) VALUES(?,?)",plan.responseId,n(reused.getFirst(),"id"));return new Outcome(runs.execution(reused.getFirst(),true,maximum-used,plan.inputRevision),null);}if(used>=maximum)throw new ApiException(429,"EVALUATION_LIMIT_REACHED");}
            String error=stale!=null?stale:finalError;String status=stale!=null?"CANCELLED":error==null?"SUCCEEDED":error.equals("EXECUTION_TIMED_OUT")?"TIMED_OUT":"FAILED";String executionId=PublicIds.next();
            db.jdbc().update("INSERT INTO mp_execution_record(public_id,request_public_id,experience_run_id,step_key,engine_type,engine_version,operation_key,input_revision,trust_level,evaluation_config_sha256,input_sha256,status,result_json,error_code,duration_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",executionId,executionId,run.id(),plan.stepKey,plan.operation.path("engineType").asText(),plan.operation.path("engineVersion").asText(),input.operationKey(),plan.inputRevision,"SERVER_VERIFIED",error==null?plan.configSha:null,plan.inputSha,status,error==null?db.json(finalResult):null,error,duration);
            var record=db.jdbc().queryForMap("SELECT * FROM mp_execution_record WHERE public_id=?",executionId);if(error==null)db.jdbc().update("INSERT INTO mp_response_execution(response_revision_id,execution_record_id) VALUES(?,?)",plan.responseId,n(record,"id"));
            db.event(run,"execution.completed",map("operationKey",input.operationKey(),"status",status,"durationBucket",duration<1000?"UNDER_1S":"1S_OR_MORE","errorCode",error));return new Outcome(runs.execution(record,false,maximum-used-(error==null?1:0),error==null?plan.inputRevision:null),error);
        });
        return finished(outcome);
    }
    private RunDtos.Execution finished(Outcome outcome){if(outcome.errorCode()!=null)throw new ApiException(Set.of("RUN_PAUSED","RUN_STATE_INVALID","EXECUTION_REVISION_STALE").contains(outcome.errorCode())?409:422,outcome.errorCode());return outcome.execution();}
    static boolean equalNumbers(JsonNode expected,JsonNode observed){if(expected.isNumber()&&observed.isNumber())return expected.decimalValue().compareTo(observed.decimalValue())==0;if(expected.isObject()&&observed.isObject()){if(expected.size()!=observed.size())return false;var names=expected.fieldNames();while(names.hasNext()){String name=names.next();if(!observed.has(name)||!equalNumbers(expected.get(name),observed.get(name)))return false;}return true;}if(expected.isArray()&&observed.isArray()){if(expected.size()!=observed.size())return false;for(int i=0;i<expected.size();i++)if(!equalNumbers(expected.get(i),observed.get(i)))return false;return true;}return expected.equals(observed);}
}
