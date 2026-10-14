package com.ruoyi.majorpilot.datascience;
import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.ApiException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service @Profile({"local","pilot"})
public final class DsStatsEngine {
    private final TaskContentRepository repository;private final ObjectMapper mapper;
    public DsStatsEngine(TaskContentRepository repository,ObjectMapper mapper){this.repository=repository;this.mapper=mapper;}
    private TaskContentRepository.Bundle bundle(TaskContent.Version version,JsonNode operation){
        if(!operation.path("engineType").asText().equals("DATA_ANALYSIS")||!operation.path("engineVersion").asText().equals("ds-stats-v1"))throw new ApiException(422,"EXECUTION_NOT_ALLOWED");
        var bundle=repository.bundles().stream().filter(b->b.manifest().path("taskVersionId").asText().equals(version.taskVersionId())).findFirst().orElseThrow(()->new ApiException(503,"CONTENT_INTEGRITY_FAILED"));
        if(!bundle.manifestSha256().equals(version.manifestSha256()))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");return bundle;
    }
    public JsonNode normalize(TaskContent.Version version,JsonNode operation,JsonNode raw){bundle(version,operation);return DsSemantics.normalize(operation.path("operationKey").asText(),raw);}
    public JsonNode calculate(TaskContent.Version version,JsonNode operation,JsonNode raw){
        var bundle=bundle(version,operation);byte[] bytes=repository.asset(bundle,operation.path("datasetAssetKey").asText(),true);
        try{return DsStatistics.calculate(operation.path("operationKey").asText(),mapper.readTree(bytes),raw,TaskContentRepository.hash(bytes));}catch(ApiException failure){throw failure;}catch(Exception failure){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
    }
}
