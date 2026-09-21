package com.ruoyi.majorpilot.report.claims;
import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.report.core.ReportInputException;
import com.ruoyi.majorpilot.shared.CanonicalJson;
import java.time.Instant;
import java.util.*;

/** Two bounded interpretations of the original Reflection; no performance or free-text inference. */
public final class EvidenceDeriver {
    public record ReflectionSource(String studentPublicId,String runId,String decisionProfileId,String taskVersionId,long sourceId,long revision,long expectedRevision,String expectedSha256,JsonNode answers,Instant observedAt){public ReflectionSource{answers=answers.deepCopy();}@Override public JsonNode answers(){return answers.deepCopy();}}
    public record Input(String studentPublicId,String runId,String decisionProfileId,String taskVersionId,String taskManifestSha256,String majorCode,String questionSetVersion,String closedSchema,String sourceRule,String effectiveRule,ReflectionSource reflection,Map<String,JsonNode> selfReports){public Input{var copy=new TreeMap<String,JsonNode>();selfReports.forEach((k,v)->copy.put(k,v.deepCopy()));selfReports=Collections.unmodifiableMap(copy);}}
    public record DerivedItemDraft(String key,String type,String sourceType,long sourceId,JsonNode value,String summary,List<String> claims,Instant observedAt){public DerivedItemDraft{value=value.deepCopy();claims=List.copyOf(claims);}@Override public JsonNode value(){return value.deepCopy();}}
    private final ObjectMapper mapper;private final EvidenceRuleRegistry registry;
    public EvidenceDeriver(ObjectMapper mapper,EvidenceRuleRegistry registry){this.mapper=mapper;this.registry=registry;}
    public Optional<DerivedItemDraft> derive(Input input){
        var entry=registry.requireCompatible(input.sourceRule(),input.effectiveRule(),input.closedSchema(),input.majorCode(),input.taskVersionId(),input.taskManifestSha256(),input.questionSetVersion());
        if(input.effectiveRule().equals(entry.oldRule()))return Optional.empty();
        var r=input.reflection();require(Objects.equals(input.studentPublicId(),r.studentPublicId())&&Objects.equals(input.runId(),r.runId())&&Objects.equals(input.decisionProfileId(),r.decisionProfileId())&&Objects.equals(input.taskVersionId(),r.taskVersionId())&&r.sourceId()>0&&r.revision()>0&&r.revision()==r.expectedRevision()&&r.observedAt()!=null&&CanonicalJson.hash(mapper,r.answers()).equals(r.expectedSha256()));
        JsonNode interests=r.answers().path("interestingStepKeys"),continuation=r.answers().path("continueSimilarWork");
        require(interests.isArray()&&interests.size()>=1&&interests.size()<=3&&continuation.isTextual()&&Set.of("YES","UNSURE","NO").contains(continuation.asText()));var seen=new HashSet<String>();for(var step:interests)require(step.isTextual()&&seen.add(step.asText())&&(step.asText().equals("NONE")||entry.stepKeys().contains(step.asText())));require(!seen.contains("NONE")||seen.size()==1);
        require(interests.equals(input.selfReports().get("reflection:interestingStepKeys"))&&continuation.equals(input.selfReports().get("reflection:continueSimilarWork")));
        if(seen.contains("NONE"))return Optional.empty();
        String rule=continuation.asText().equals("YES")?"INTEREST_WITH_CONTINUATION":"INTEREST_WITHOUT_CONFIRMED_CONTINUATION";
        var value=mapper.createObjectNode();value.put("scope","THIS_EXPERIENCE").put("derivationRuleKey",rule).put("questionSetVersion",input.questionSetVersion()).put("reflectionRevision",r.revision()).put("reflectionSha256",r.expectedSha256());value.set("interestingStepKeys",interests.deepCopy());value.set("continueSimilarWork",continuation.deepCopy());value.set("sourceEvidenceKeys",mapper.valueToTree(List.of("reflection:interestingStepKeys","reflection:continueSimilarWork")));
        return Optional.of(new DerivedItemDraft("derived:reflection-interest-continuation","DERIVED_INTERPRETATION","REFLECTION",r.sourceId(),value,"仅解释本次兴趣与继续意愿，不推断稳定能力或确定专业方向",List.of("BOUNDED_INTERPRETATION"),r.observedAt()));
    }
    private static void require(boolean condition){if(!condition)throw new ReportInputException("REPORT_SOURCE_INVALID");}
}
