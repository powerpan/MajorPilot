package com.ruoyi.majorpilot.report.core;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.*;

/** Value-only integration boundary. No persistence, network or current-state lookups. */
public final class ReportModels {
    private ReportModels() {}
    public enum ReportType { EXPERIENCE, COMPARISON }
    public enum GenerationMode { AI, DETERMINISTIC_FALLBACK }
    public enum ClaimType { OBSERVED_FACT, STUDENT_SELF_REPORT, BOUNDED_INTERPRETATION, LIMITATION, NEXT_STEP }
    public enum Confidence { DIRECT, SELF_REPORTED, BOUNDED, RULE_BASED }
    public static final List<String> MAJORS=List.of("AI","BUSINESS_ANALYTICS","DATA_SCIENCE");
    public static final List<String> EXPERIENCE_SECTIONS=List.of("OVERVIEW","WHAT_YOU_DID","EXPERIENCE_PREFERENCE","CURRENT_PREPARATION","TASK_PERFORMANCE","WORK_STYLE_CONNECTION","EVIDENCE_BOUNDARIES","OTHER_MAJOR_DIFFERENCES","NEXT_EXPERIENCE");
    public static final List<String> COMPARISON_SECTIONS=List.of("SCOPE_AND_SOURCES","WORK_COMPLETED","SELF_REPORTED_EXPERIENCE","COMMON_DIMENSIONS","MAJOR_SPECIFIC_EXPERIENCE","UNKNOWNS","NEXT_VERIFICATION","REMAINING_MAJOR");
    public static final List<String> DIMENSIONS=List.of("PROBLEM_INTEREST","QUANTITATIVE_COMFORT","UNCERTAINTY_HANDLING","WORK_FOCUS","HELP_AND_ITERATION","EXPLANATION_INTEREST","CONTINUATION_WILLINGNESS");
    public record Header(String reportId,String reportVersionId,int versionNo,ReportType reportType,String studentPublicId,Instant generatedAt) {}
    public record VersionPins(String requestSchemaVersion,String inputSchemaVersion,String claimRuleVersion,String templateVersion,String promptVersion,String outputSchemaVersion) {
        public static VersionPins v1(){return new VersionPins("report-request-v1","report-input-v1","report-claims-v1","report-template-v1","report-prompt-v1","report-v1");}
    }
    public record SourcePins(String runId,String runMode,String contentKind,String runStatus,String taskVersionId,String taskManifestSha256,String taskVersionCode,String taskTitle,String decisionProfileId,String profileSha256,String closedInputSha256,String questionSetVersion,Map<String,String> stepTitles) {
        public SourcePins{stepTitles=Collections.unmodifiableMap(new LinkedHashMap<>(stepTitles));}
    }
    /** The persistence adapter verifies the historical 8-field snapshot hash before projection. */
    public record SnapshotRef(String snapshotId,String status,String studentPublicId,String runId,String taskVersionId,String decisionProfileId,String closedInputSha256,String snapshotSha256,String sourceRule,String effectiveRule) {}
    public record EvidenceValue(String publicId,String key,String type,JsonNode value,String summary,List<String> allowedClaimTypes,Instant observedAt) {
        public EvidenceValue{value=value==null?null:value.deepCopy();allowedClaimTypes=List.copyOf(allowedClaimTypes);}
        @Override public JsonNode value(){return value==null?null:value.deepCopy();}
    }
    public record ExperienceVersionRef(String reportId,String reportVersionId,int versionNo,String reportBodySha256,JsonNode validatedPublicBody) {
        public ExperienceVersionRef{validatedPublicBody=validatedPublicBody==null?null:validatedPublicBody.deepCopy();}
        @Override public JsonNode validatedPublicBody(){return validatedPublicBody==null?null:validatedPublicBody.deepCopy();}
    }
    public record Source(String majorCode,String studentPublicId,SourcePins pins,SnapshotRef snapshot,List<EvidenceValue> items,ExperienceVersionRef experienceVersion) {public Source{items=List.copyOf(items);}}
    public record NextProjection(String state,String recommendationId,String sourceRunId,String ruleVersion,List<String> completedMajorCodes,String primaryMajor,List<String> alternativeMajors,List<String> reasonCodes) {
        public NextProjection{completedMajorCodes=List.copyOf(completedMajorCodes);alternativeMajors=List.copyOf(alternativeMajors);reasonCodes=List.copyOf(reasonCodes);}
    }
    public record ReportInput(Header header,VersionPins versions,List<Source> sources,NextProjection nextRecommendation) {public ReportInput{sources=List.copyOf(sources);}}
    public record Entry(String statementKey,ClaimType claimType,List<String> allowedSectionKeys,List<String> evidenceIds,List<String> ruleRefs,JsonNode valueBindings,String attribution,Confidence confidence,Map<String,String> phrasings,String basisSummary,String majorCode,String dimensionKey,String slot) {
        public Entry{allowedSectionKeys=List.copyOf(allowedSectionKeys);evidenceIds=List.copyOf(evidenceIds);ruleRefs=List.copyOf(ruleRefs);valueBindings=valueBindings==null?null:valueBindings.deepCopy();phrasings=Collections.unmodifiableMap(new TreeMap<>(phrasings));}
        @Override public JsonNode valueBindings(){return valueBindings==null?null:valueBindings.deepCopy();}
    }
    public record Catalog(ReportType reportType,String inputSha256,String claimRuleVersion,List<Entry> entries,String catalogSha256) {public Catalog{entries=List.copyOf(entries);}}
    public record Selection(String statementKey,String phrasingKey) {}
    public record ProposalSection(String sectionKey,List<Selection> selections) {public ProposalSection{selections=List.copyOf(selections);}}
    public record Proposal(String schemaVersion,ReportType reportType,List<ProposalSection> sections) {public Proposal{sections=List.copyOf(sections);}}
    public record Violation(String code,String path) {}
    public record Validation(boolean valid,List<Violation> issues) {public Validation{issues=List.copyOf(issues);}}
    public record ClaimLink(String sectionKey,int claimOrder,String statementKey,ClaimType claimType,String text,Confidence confidence,String dimensionKey,String majorCode,List<String> evidenceIds,List<String> ruleRefs) {public ClaimLink{evidenceIds=List.copyOf(evidenceIds);ruleRefs=List.copyOf(ruleRefs);}}
    public record ValidatedReport(JsonNode publicReportJson,List<ClaimLink> claims,String bodySha256,String catalogSha256,Validation validation) {
        public ValidatedReport{publicReportJson=publicReportJson.deepCopy();claims=List.copyOf(claims);}
        @Override public JsonNode publicReportJson(){return publicReportJson.deepCopy();}
    }
    public record SafeModelInput(String schemaVersion,String catalogSha256,JsonNode content) {
        public SafeModelInput{content=content.deepCopy();}
        @Override public JsonNode content(){return content.deepCopy();}
    }
}
