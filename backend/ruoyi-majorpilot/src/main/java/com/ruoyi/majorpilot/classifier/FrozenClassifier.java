package com.ruoyi.majorpilot.classifier;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.shared.ApiException;
import java.math.*;
import java.text.Normalizer;
import java.util.*;

/** classifier-v1: frozen teaching algorithm, never calls a model or executes code. */
public final class FrozenClassifier {
    public static final List<String> LABELS=List.of("technical_issue","concept_confusion","schedule_constraint","motivation_support");
    public static final String MANUAL="MANUAL_REVIEW";
    private static final ObjectMapper JSON=new ObjectMapper();
    private FrozenClassifier(){}
    public static double halfUp6(double number){if(!Double.isFinite(number))throw invalid();return BigDecimal.valueOf(number).setScale(6,RoundingMode.HALF_UP).doubleValue();}
    public static Map<String,Integer> features(String text){int[] chars=Normalizer.normalize(text,Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[\\p{IsWhite_Space}\\p{P}]","").codePoints().toArray();Map<String,Integer> result=new LinkedHashMap<>();for(int i=0;i+1<chars.length;i++)result.merge(new String(chars,i,2),1,Integer::sum);return result;}
    public static JsonNode normalize(JsonNode model,JsonNode raw){
        if(raw==null||!raw.isObject()||raw.size()!=4)throw invalid();for(String key:List.of("definitionVariantIds","exampleIds","confidenceThreshold","lowConfidencePolicy"))if(!raw.has(key))throw invalid();
        JsonNode ids=raw.path("definitionVariantIds");if(!ids.isObject()||ids.size()!=4)throw invalid();ObjectNode normalized=JSON.createObjectNode(),ordered=normalized.putObject("definitionVariantIds");
        for(String label:LABELS){JsonNode id=ids.get(label);if(id==null||!id.isTextual()||find(model.path("definitionVariants"),"id",id.asText(),"label",label)==null)throw invalid();ordered.put(label,id.asText());}
        JsonNode examples=raw.path("exampleIds");if(!examples.isArray()||examples.size()>4)throw invalid();Set<String> selected=new TreeSet<>();for(JsonNode id:examples)if(!id.isTextual()||!selected.add(id.asText())||find(model.path("examples"),"exampleId",id.asText(),null,null)==null)throw invalid();selected.forEach(normalized.putArray("exampleIds")::add);
        JsonNode threshold=raw.path("confidenceThreshold");if(!threshold.isNumber()||!Set.of(0.4,0.55,0.7).contains(threshold.asDouble())||!Set.of(MANUAL,"AUTO_ROUTE").contains(raw.path("lowConfidencePolicy").asText()))throw invalid();normalized.put("confidenceThreshold",threshold.asDouble());normalized.put("lowConfidencePolicy",raw.path("lowConfidencePolicy").asText());return normalized;
    }
    private static JsonNode find(JsonNode values,String field,String value,String field2,String value2){for(JsonNode v:values)if(v.path(field).asText().equals(value)&&(field2==null||v.path(field2).asText().equals(value2)))return v;return null;}
    public static JsonNode predict(JsonNode model,JsonNode raw,String text){
        JsonNode config=normalize(model,raw);List<String> vocabulary=new ArrayList<>();for(JsonNode token:model.path("vocabulary"))vocabulary.add(token.asText());
        Map<String,Map<String,Integer>> counts=new LinkedHashMap<>();for(String label:LABELS){Map<String,Integer> row=new LinkedHashMap<>();for(String token:vocabulary)row.put(token,model.path("baseCounts").path(label).path(token).asInt());counts.put(label,row);}
        for(JsonNode id:config.path("exampleIds")){JsonNode example=find(model.path("examples"),"exampleId",id.asText(),null,null);var row=counts.get(example.path("goldLabel").asText());for(var e:features(example.path("messageText").asText()).entrySet())if(row.containsKey(e.getKey()))row.merge(e.getKey(),e.getValue(),Integer::sum);}
        for(String label:LABELS){JsonNode variant=find(model.path("definitionVariants"),"id",config.path("definitionVariantIds").path(label).asText(),"label",label);for(JsonNode token:variant.path("features")){if(!counts.get(label).containsKey(token.asText()))throw invalid();counts.get(label).merge(token.asText(),1,Integer::sum);}}
        Map<String,Integer> input=features(text);double[] scores=new double[4];for(int c=0;c<4;c++){var row=counts.get(LABELS.get(c));double denominator=row.values().stream().mapToInt(Integer::intValue).sum()+vocabulary.size();double score=StrictMath.log(0.25);for(String token:vocabulary)if(input.containsKey(token))score+=input.get(token)*StrictMath.log((row.get(token)+1)/denominator);scores[c]=halfUp6(score);}
        int winner=0;for(int i=1;i<4;i++)if(scores[i]>scores[winner])winner=i;double total=0;for(double score:scores)total+=StrictMath.exp(score-scores[winner]);double confidence=halfUp6(1/total);String predicted=LABELS.get(winner),route=config.path("lowConfidencePolicy").asText().equals(MANUAL)&&confidence<config.path("confidenceThreshold").asDouble()?MANUAL:predicted;
        ObjectNode result=JSON.createObjectNode().put("predictedLabel",predicted).put("routedLabel",route).put("confidence",confidence);ArrayNode log=result.putArray("logScores");for(double score:scores)log.add(score);return result;
    }
    private static void ratio(ObjectNode result,String key,int n,int d){if(d==0)result.putNull(key);else result.put(key,halfUp6((double)n/d));}
    public static JsonNode metrics(List<String> gold,List<String> routed){
        if(gold.isEmpty()||gold.size()!=routed.size())throw invalid();List<String> columns=new ArrayList<>(LABELS);columns.add(MANUAL);int[][] matrix=new int[4][5];for(int i=0;i<gold.size();i++){int r=LABELS.indexOf(gold.get(i)),c=columns.indexOf(routed.get(i));if(r<0||c<0)throw invalid();matrix[r][c]++;}
        int manual=0,correct=0;for(int i=0;i<4;i++){manual+=matrix[i][4];correct+=matrix[i][i];}int auto=gold.size()-manual;
        ObjectNode out=JSON.createObjectNode().put("sampleCount",gold.size()).put("autoRoutedCount",auto).put("correctAutoRoutedCount",correct).put("manualReviewCount",manual);ratio(out,"coverage",auto,gold.size());ratio(out,"autoAccuracy",correct,auto);ratio(out,"totalCorrectAutoRate",correct,gold.size());
        ArrayNode perLabel=out.putArray("perLabel");for(int i=0;i<4;i++){int support=Arrays.stream(matrix[i]).sum(),predicted=0;for(int j=0;j<4;j++)predicted+=matrix[j][i];ObjectNode row=perLabel.addObject().put("label",LABELS.get(i));ratio(row,"precision",matrix[i][i],predicted);ratio(row,"recall",matrix[i][i],support);row.put("supportCount",support).put("predictedCount",predicted).put("truePositiveCount",matrix[i][i]);}
        ObjectNode confusion=out.putObject("confusionMatrix");confusion.set("labelOrder",JSON.valueToTree(LABELS));confusion.set("columns",JSON.valueToTree(columns));confusion.set("counts",JSON.valueToTree(matrix));
        ArrayNode errors=out.putArray("errorCounts");for(int i=0;i<4;i++)for(int j=0;j<5;j++)if(i!=j)errors.addObject().put("trueLabel",LABELS.get(i)).put("predictedLabel",columns.get(j)).put("count",matrix[i][j]);return out;
    }
    public static JsonNode evaluate(JsonNode model,JsonNode config,JsonNode samples){List<String> gold=new ArrayList<>(),routed=new ArrayList<>();for(JsonNode sample:samples){gold.add(sample.path("goldLabel").asText());routed.add(predict(model,config,sample.path("messageText").asText()).path("routedLabel").asText());}return metrics(gold,routed);}
    public static JsonNode compare(JsonNode model,JsonNode config,JsonNode samples){
        JsonNode baseline=evaluate(model,model.path("baselineConfig"),samples),candidate=evaluate(model,config,samples);ObjectNode out=JSON.createObjectNode().put("schemaVersion","classifier-result-v1");out.set("baseline",baseline);out.set("candidate",candidate);ObjectNode delta=out.putObject("delta");for(String key:List.of("coverage","autoAccuracy","totalCorrectAutoRate")){if(baseline.path(key).isNull()||candidate.path(key).isNull())delta.putNull(key);else delta.put(key,halfUp6(candidate.path(key).asDouble()-baseline.path(key).asDouble()));}delta.put("manualReviewCount",candidate.path("manualReviewCount").asInt()-baseline.path("manualReviewCount").asInt());ArrayNode changes=out.putArray("errorCategoryChanges");for(int i=0;i<baseline.path("errorCounts").size();i++){JsonNode a=baseline.path("errorCounts").get(i),b=candidate.path("errorCounts").get(i);changes.addObject().put("trueLabel",a.path("trueLabel").asText()).put("predictedLabel",a.path("predictedLabel").asText()).put("baselineCount",a.path("count").asInt()).put("candidateCount",b.path("count").asInt()).put("change",b.path("count").asInt()-a.path("count").asInt());}return out;
    }
    static ApiException invalid(){return new ApiException(422,"CLASSIFIER_CONFIG_INVALID");}
}
