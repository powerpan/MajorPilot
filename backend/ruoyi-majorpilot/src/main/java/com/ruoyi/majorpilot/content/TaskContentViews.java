package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import java.util.List;

/** Explicit projection: private resource names, paths, hashes and evaluation configuration never leave the backend. */
public final class TaskContentViews {
    private TaskContentViews() {}
    private static ObjectNode select(JsonNode input,List<String> keys) { ObjectNode out=JsonNodeFactory.instance.objectNode();for(String key:keys)if(input.has(key))out.set(key,input.get(key).deepCopy());return out; }
    public static JsonNode publicManifest(TaskContent.Version version) {
        JsonNode manifest=version.manifest();ObjectNode result=select(manifest,List.of("schemaVersion","taskVersionId","contentKind","majorCode","demoKey","versionCode","title","scenario","goals","estimatedMinutes","reflection"));
        ArrayNode assets=result.putArray("assets");for(JsonNode asset:manifest.path("assets"))if(asset.path("visibility").asText().equals("PUBLIC"))assets.add(select(asset,List.of("assetKey","mediaType","sha256","byteLength")));
        ArrayNode steps=result.putArray("steps");for(JsonNode step:manifest.path("steps"))steps.add(publicStep(step));
        ArrayNode operations=result.putArray("operations");for(JsonNode operation:manifest.path("operations"))operations.add(select(operation,List.of("operationKey","stepKey","parametersSchema","resultSchema","maxEvaluations")));
        return result;
    }
    public static JsonNode publicStep(JsonNode step) { return select(step,List.of("stepKey","title","instructions","dependencies","required","responseSchemaVersion","inputSchema","assetKeys","operationKey")); }
}
