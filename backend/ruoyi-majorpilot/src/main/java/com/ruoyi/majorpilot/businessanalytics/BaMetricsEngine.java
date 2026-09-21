package com.ruoyi.majorpilot.businessanalytics;
import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.ApiException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service @Profile("local")
public final class BaMetricsEngine {
    private final TaskContentRepository repository;private final ObjectMapper mapper;
    public BaMetricsEngine(TaskContentRepository repository,ObjectMapper mapper){this.repository=repository;this.mapper=mapper;}
    private TaskContentRepository.Bundle bundle(TaskContent.Version version,JsonNode operation){
        if(!operation.path("engineType").asText().equals("BUSINESS_ANALYSIS")||!operation.path("engineVersion").asText().equals("ba-metrics-v1"))throw new ApiException(422,"EXECUTION_NOT_ALLOWED");
        var b=repository.bundles().stream().filter(v->v.manifest().path("taskVersionId").asText().equals(version.taskVersionId())).findFirst().orElseThrow(()->new ApiException(503,"CONTENT_INTEGRITY_FAILED"));
        if(!b.manifestSha256().equals(version.manifestSha256()))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");return b;
    }
    public JsonNode normalize(TaskContent.Version version,JsonNode operation,JsonNode raw){bundle(version,operation);return BaSemantics.normalize(operation.path("operationKey").asText(),raw);}
    public JsonNode calculate(TaskContent.Version version,JsonNode operation,JsonNode raw){
        var b=bundle(version,operation);byte[] bytes=repository.asset(b,operation.path("datasetAssetKey").asText(),true);
        try{return BaStatistics.calculate(operation.path("operationKey").asText(),mapper.readTree(bytes),raw,TaskContentRepository.hash(bytes));}
        catch(ApiException failure){if(failure.code.equals("BA_DATA_INVALID"))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");throw failure;}catch(Exception failure){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
    }
}
