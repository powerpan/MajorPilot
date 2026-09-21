package com.ruoyi.majorpilot.report.claims;
import java.util.*;
import com.ruoyi.majorpilot.report.core.ReportInputException;

/** Exact immutable compatibility registrations. No wildcard or runtime environment override. */
public final class EvidenceRuleRegistry {
    public record Compatibility(String closedSchema,String majorCode,String taskVersionId,String manifestSha256,String questionSetVersion,String oldRule,String newRule,List<String> stepKeys) {public Compatibility{stepKeys=List.copyOf(stepKeys);}}
    private final List<Compatibility> entries;
    public EvidenceRuleRegistry(){this(List.of());}
    /** Additional entries are explicitly supplied by test composition; production has no seed/config endpoint. */
    public EvidenceRuleRegistry(List<Compatibility> additional){var all=new ArrayList<>(production());all.addAll(additional);var ids=new HashSet<String>();for(var e:all)if(!ids.add(e.taskVersionId()))throw new IllegalArgumentException("Duplicate evidence registration");entries=List.copyOf(all);}
    public static List<Compatibility> production(){return List.of(
        new Compatibility("closed-input-v3","AI","01JA1000000000000000000001","813d1ba169586ed56a09fef86caf514c407497668e1f8bb5114a82391cc8e06f","ai-reflection-v1","evidence-v2","evidence-v3",List.of("a1-task","a2-metrics","a3-errors","a4-configure","a5-evaluate","a6-decision")),
        new Compatibility("closed-input-v3","DATA_SCIENCE","01JD1000000000000000000001","0e3fad47b7b5e4b15c0666429a5cd163eb4b1115524e00d4140c8bc89132c8c2","ds-reflection-v1","ds-evidence-v1","ds-evidence-v2",List.of("d1-context","d2-quality","d3-profile","d4-relationship","d5-stratify","d6-conclusion")),
        new Compatibility("closed-input-v3","BUSINESS_ANALYTICS","01JB1000000000000000000001","ba81c1c6cc8600a54d38bc164539f163493d6ae11be5a8354827747cf480d8a3","ba-reflection-v1","ba-evidence-v1","ba-evidence-v2",List.of("b1-context","b2-metric","b3-funnel","b4-segment","b5-hypothesis","b6-action")));
    }
    public Compatibility exact(String closedSchema,String major,String task,String sha,String questionSet){return entries.stream().filter(e->e.closedSchema().equals(closedSchema)&&e.majorCode().equals(major)&&e.taskVersionId().equals(task)&&e.manifestSha256().equals(sha)&&e.questionSetVersion().equals(questionSet)).findFirst().orElseThrow(()->new ReportInputException("EVIDENCE_RULE_UNSUPPORTED"));}
    public String forNewClose(String major,String task,String sha,String questionSet){return exact("closed-input-v3",major,task,sha,questionSet).newRule();}
    public Compatibility requireCompatible(String sourceRule,String effectiveRule,String closedSchema,String major,String task,String sha,String questionSet){var e=exact(closedSchema,major,task,sha,questionSet);boolean same=sourceRule.equals(e.oldRule())&&effectiveRule.equals(e.oldRule())||sourceRule.equals(e.newRule())&&effectiveRule.equals(e.newRule());boolean explicitUpgrade=sourceRule.equals(e.oldRule())&&effectiveRule.equals(e.newRule());if(!same&&!explicitUpgrade)throw new ReportInputException("EVIDENCE_RULE_UNSUPPORTED");return e;}
}
