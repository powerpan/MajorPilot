package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.util.*;
import static com.ruoyi.majorpilot.experience.RunStore.*;

/** One saved-source resolver for execution, completion, history and public input provenance. */
final class ExecutionBindings {
    record Bound(ObjectNode parameters,List<RunDtos.InputBinding> ancestors,Map<String,Long> sources) {}
    private final RunService runs;
    ExecutionBindings(RunService runs){this.runs=runs;}
    Bound resolve(Row run,JsonNode operation,JsonNode ownResponse){
        var db=runs.store();var manifest=runs.version(run).manifest();boolean v3=savedBindings(manifest);
        var parameters=db.mapper().createObjectNode();var ancestors=new ArrayList<RunDtos.InputBinding>();var sources=new TreeMap<String,Long>();
        for(var binding:operation.path("inputBindings")){
            String source=binding.path("sourceStepKey").asText(),field=binding.path("sourceField").asText(),parameter=binding.path("parameterKey").asText();
            if(v3&&!isAncestor(manifest.path("steps"),operation.path("stepKey").asText(),source))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");
            var definition=runs.stepDefinition(run,source);var state=runs.stepState(run,source);long revision=n(state,"current_revision");
            if(revision==0)throw new ApiException(409,"EXECUTION_REVISION_STALE");
            var value=runs.response(state).get(field);
            if(value==null){if(v3&&optional(definition.path("inputSchema"),field)&&optional(operation.path("parametersSchema"),parameter))continue;throw new ApiException(409,"EXECUTION_REVISION_STALE");}
            parameters.set(parameter,value);ancestors.add(new RunDtos.InputBinding(parameter,source,field,revision,value));sources.put(source,revision);
        }
        // Read-only provenance does not resolve own required fields: an unstarted step may have revision zero.
        if(ownResponse!=null){
            if(v3){for(var binding:operation.path("ownResponseBindings")){
                String field=binding.path("sourceField").asText(),parameter=binding.path("parameterKey").asText();var value=ownResponse.get(field);
                if(value==null){if(optional(runs.stepDefinition(run,operation.path("stepKey").asText()).path("inputSchema"),field)&&optional(operation.path("parametersSchema"),parameter))continue;throw new ApiException(422,"STEP_VALIDATION_FAILED");}
                if(parameters.has(parameter))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");parameters.set(parameter,value);
            }}else if(ancestors.isEmpty()){
                var fields=operation.path("parametersSchema").path("properties").fieldNames();while(fields.hasNext()){String field=fields.next();if(ownResponse.has(field))parameters.set(field,ownResponse.get(field));}
            }
        }
        return new Bound(parameters,List.copyOf(ancestors),Collections.unmodifiableMap(sources));
    }
    static boolean savedBindings(JsonNode manifest){return Set.of("task-manifest-v3","task-manifest-v4").contains(manifest.path("schemaVersion").asText());}
    static boolean optional(JsonNode schema,String field){if(!schema.path("properties").has(field))return false;for(var required:schema.path("required"))if(required.asText().equals(field))return false;return true;}
    static boolean isAncestor(JsonNode steps,String step,String candidate){
        if(step.equals(candidate))return false;var byKey=new HashMap<String,JsonNode>();for(var definition:steps)byKey.put(definition.path("stepKey").asText(),definition);
        var pending=new ArrayDeque<String>();pending.add(step);var visited=new HashSet<String>();
        while(!pending.isEmpty()){String current=pending.removeFirst();if(!visited.add(current))continue;var definition=byKey.get(current);if(definition==null)return false;for(var dependency:definition.path("dependencies")){String parent=dependency.asText();if(parent.equals(candidate))return true;pending.addLast(parent);}}
        return false;
    }
}
