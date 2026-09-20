package com.ruoyi.majorpilot.classifier;

import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.ApiException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service @Profile("local")
public final class ClassifierEngine {
    private final TaskContentRepository repository;private final ObjectMapper mapper;
    public ClassifierEngine(TaskContentRepository repository,ObjectMapper mapper){this.repository=repository;this.mapper=mapper;}
    private JsonNode asset(TaskContent.Version version,JsonNode operation,String key){
        if(!operation.path("engineType").asText().equals("FROZEN_CLASSIFIER")||!operation.path("engineVersion").asText().equals("classifier-v1"))throw new ApiException(422,"EXECUTION_NOT_ALLOWED");
        var bundle=repository.bundles().stream().filter(b->b.manifest().path("taskVersionId").asText().equals(version.taskVersionId())).findFirst().orElseThrow(()->new ApiException(503,"CONTENT_INTEGRITY_FAILED"));
        if(!bundle.manifestSha256().equals(version.manifestSha256()))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");
        try{return mapper.readTree(repository.asset(bundle,operation.path(key).asText(),false));}catch(ApiException failure){throw failure;}catch(Exception failure){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
    }
    public JsonNode normalize(TaskContent.Version version,JsonNode operation,JsonNode raw){return FrozenClassifier.normalize(asset(version,operation,"modelAssetKey"),raw);}
    public boolean isBaseline(TaskContent.Version version,JsonNode operation,JsonNode normalized){JsonNode model=asset(version,operation,"modelAssetKey");return FrozenClassifier.normalize(model,normalized).equals(FrozenClassifier.normalize(model,model.path("baselineConfig")));}
    public JsonNode calculate(TaskContent.Version version,JsonNode operation,JsonNode normalized){return FrozenClassifier.compare(asset(version,operation,"modelAssetKey"),normalized,asset(version,operation,"datasetAssetKey"));}
}
