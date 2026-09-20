package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.ApiException;
import java.math.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import com.ruoyi.majorpilot.classifier.ClassifierEngine;
@Component @Profile("local")
public class FixedExecutionCalculator implements ExecutionCalculator {
    private final TaskContentProvider content;private final ObjectMapper mapper;private final ClassifierEngine classifier;
    @Autowired public FixedExecutionCalculator(TaskContentProvider content,ObjectMapper mapper,ClassifierEngine classifier){this.content=content;this.mapper=mapper;this.classifier=classifier;}
    public FixedExecutionCalculator(TaskContentProvider content,ObjectMapper mapper){this(content,mapper,null);}
    private boolean classifier(JsonNode operation){return operation.path("engineType").asText().equals("FROZEN_CLASSIFIER");}
    @Override public JsonNode normalize(TaskContent.Version version,JsonNode operation,JsonNode parameters){return classifier(operation)?classifier.normalize(version,operation,parameters):parameters;}
    @Override public boolean isBaseline(TaskContent.Version version,JsonNode operation,JsonNode parameters){return classifier(operation)&&classifier.isBaseline(version,operation,parameters);}
    @Override public JsonNode calculate(TaskContent.Version version,JsonNode operation,JsonNode parameters) {
        if(classifier(operation))return classifier.calculate(version,operation,parameters);
        if(!operation.path("engineType").asText().equals("DEMO_SUMMARY")||!operation.path("engineVersion").asText().equals("demo-summary-v1")||!version.contentKind().equals("DEMO"))throw new ApiException(422,"EXECUTION_NOT_ALLOWED");
        ResponseRules.validate(operation.path("parametersSchema"),parameters,true);
        JsonNode dataset;try{byte[] bytes=content.publicAsset(version,operation.path("datasetAssetKey").asText()).bytes();if(bytes.length>1048576)throw new IllegalArgumentException();dataset=mapper.readTree(bytes);}catch(Exception invalid){throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
        var rows=dataset.path("rows");if(!rows.isArray()||rows.isEmpty()||rows.size()>1000)throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");
        int count=parameters.get("include").asText().equals("FIRST_TWO")?Math.min(2,rows.size()):rows.size();BigDecimal sum=BigDecimal.ZERO;
        for(int i=0;i<count;i++){var value=rows.get(i).path("value");if(!value.isNumber()||!Double.isFinite(value.doubleValue()))throw new ApiException(503,"CONTENT_INTEGRITY_FAILED");sum=sum.add(value.decimalValue().multiply(parameters.get("multiplier").decimalValue()));}
        var result=mapper.createObjectNode();result.put("count",count);result.put("sum",sum);result.put("mean",sum.divide(BigDecimal.valueOf(count),6,RoundingMode.HALF_UP).stripTrailingZeros());result.set("multiplier",parameters.get("multiplier"));result.set("include",parameters.get("include"));ResponseRules.validate(operation.path("resultSchema"),result,true);return result;
    }
}
