package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.acceptance.ProductEligibility;
import com.ruoyi.majorpilot.report.claims.EvidenceRuleRegistry;
import com.ruoyi.majorpilot.report.core.ReportInputException;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;

/** Runs inside the close transaction; no external calls or deferred domain facts. */
@Service @Profile("local")
public class ClosurePipeline {
    public static final String RULE="evidence-v2",DS_RULE="ds-evidence-v1",BA_RULE="ba-evidence-v1",NEXT_RULE="next-recommendation-v1";
    private final RunService runs;private final RunStore db;private final EvidenceRuleRegistry registry;
    @Autowired public ClosurePipeline(RunService runs,EvidenceRuleRegistry registry){this.runs=runs;this.db=runs.store();this.registry=registry;}
    /** Legacy fixtures exercise the immutable pre-P6 close rules explicitly. */
    public ClosurePipeline(RunService runs){this(runs,null);}
    String hash(JsonNode value){return db.hash(value);}
    Map<String,Object> freeze(Row run,Map<String,Object> reflection,JsonNode answers){
        var steps=new ArrayList<Map<String,Object>>();var executions=new ArrayList<Map<String,Object>>();
        for(var state:db.jdbc().queryForList("SELECT * FROM mp_step_state WHERE experience_run_id=? ORDER BY id",run.id())){
            var revision=db.jdbc().queryForMap("SELECT id,revision_no,content_sha256 FROM mp_step_response_revision WHERE step_state_id=? AND revision_no=?",n(state,"id"),n(state,"current_revision"));
            steps.add(map("stepKey",s(state,"step_key"),"revisionId",n(revision,"id"),"revision",n(revision,"revision_no"),"sha256",s(revision,"content_sha256"),"valueSha256",hash(runs.response(state))));
            String stepKey=s(state,"step_key");var definition=runs.stepDefinition(run,stepKey);
            if(!definition.path("operationKey").asText("").isBlank()){
                RunDtos.Execution result;
                try{result=runs.currentExecution(run,stepKey);}catch(ApiException invalid){throw new ApiException(409,"EVIDENCE_SOURCE_INVALID");}
                if(result==null)throw new ApiException(409,"EVIDENCE_SOURCE_INVALID");
                long execution=db.jdbc().queryForObject("SELECT id FROM mp_execution_record WHERE public_id=?",Long.class,result.executionId());
                executions.add(map("executionId",execution,"publicId",result.executionId(),"stepKey",result.stepKey(),"operationKey",result.operationKey(),"resultSha256",hash(result.result()),"appliedRevision",result.appliedToRevision(),"sourceRevisions",result.appliedSourceRevisions()));
            }
        }
        var hints=new ArrayList<Map<String,Object>>();for(var hint:db.jdbc().queryForList("SELECT * FROM mp_hint_request WHERE experience_run_id=? AND status IN ('SUCCEEDED','FALLBACK') ORDER BY id",run.id()))hints.add(map("hintId",n(hint,"id"),"stepKey",s(hint,"step_key"),"hintLevel",n(hint,"hint_level"),"inputRevision",n(hint,"input_revision"),"responseSha256",hash(db.node(hint.get("response_json")))));
        String rule="BUSINESS_ANALYTICS".equals(run.majorCode())?BA_RULE:"DATA_SCIENCE".equals(run.majorCode())?DS_RULE:RULE;
        if(registry!=null&&run.kind().equals("MAJOR")){var task=runs.version(run);try{rule=registry.forNewClose(run.majorCode(),run.taskPublicId(),task.manifestSha256(),task.manifest().path("reflection").path("questionSetVersion").asText());}catch(ReportInputException unregistered){/* Unregistered tasks retain the exact legacy rule, never an assumed new rule. */}}
        return map("schemaVersion","closed-input-v3","evidenceRuleVersion",rule,"runId",run.publicId(),"contentKind",run.kind(),"runMode",run.mode(),"taskVersionId",run.taskPublicId(),"taskManifestSha256",runs.version(run).manifestSha256(),"decisionProfileId",run.profileId(),"profileSha256",profileHash(run.profileId(),run.studentId()),"steps",steps,"executions",executions,"hints",hints,"reflectionId",n(reflection,"id"),"reflectionRevision",n(reflection,"row_version")+1,"reflectionSha256",hash(answers));
    }
    /** The implicit legacy rule is recognized for explicit rejection, never silently upgraded. */
    static String frozenRule(JsonNode manifest){
        if(manifest.path("schemaVersion").asText().equals("closed-input-v2")&&!manifest.has("evidenceRuleVersion"))return "evidence-v1";
        var rule=manifest.path("evidenceRuleVersion");
        return rule.isTextual()&&rule.asText().matches("[a-z][a-z0-9-]{0,79}")?rule.asText():"unsupported";
    }
    static String evidenceKey(String publicId,String closedSha,String rule){return "evidence:"+publicId+":"+closedSha+":"+rule;}
    String profileHash(long profile,long student){
        var row=db.jdbc().queryForMap("SELECT questionnaire_version,profile_summary_json FROM mp_decision_profile WHERE id=? AND student_id=?",profile,student);
        var answers=new TreeMap<String,JsonNode>();for(var answer:db.jdbc().queryForList("SELECT question_key,answer_json FROM mp_decision_answer WHERE decision_profile_id=? ORDER BY question_key",profile))answers.put(s(answer,"question_key"),db.node(answer.get("answer_json")));
        return Secrets.hash(db.json(map("questionnaireVersion",s(row,"questionnaire_version"),"summary",db.node(row.get("profile_summary_json")),"answers",answers)));
    }
    void enqueue(Row run,JsonNode reflection){
        if(!run.kind().equals("MAJOR"))return;
        if(run.mode().equals("STANDARD")){
            Long next=next(run,reflection.path("nextWorkStyle").asText("SKIPPED"));
            db.jdbc().update("INSERT INTO mp_report(public_id,student_id,report_type,experience_run_id,major_id,status,next_recommendation_id) VALUES(?,?,'EXPERIENCE',?,?,'PENDING',?)",PublicIds.next(),run.studentId(),run.id(),run.majorId(),next);
        }
        var frozen=db.jdbc().queryForMap("SELECT closed_input_sha256,closed_input_manifest_json FROM mp_experience_run WHERE id=?",run.id());String closedSha=s(frozen,"closed_input_sha256"),rule=frozenRule(db.node(frozen.get("closed_input_manifest_json")));
        db.jdbc().update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_student_id,target_type,target_id,checkpoint_json) VALUES(?,'EVIDENCE_BUILD',?,?,'EXPERIENCE_RUN',?,?)",PublicIds.next(),evidenceKey(run.publicId(),closedSha,rule),run.studentId(),run.id(),db.json(map("closedInputSha256",closedSha,"evidenceRuleVersion",rule)));
    }
    Long next(Row run,String style){
        var completed=db.jdbc().queryForList("SELECT DISTINCT m.code FROM mp_experience_run r JOIN mp_major m ON m.id=r.major_id WHERE r.student_id=? AND "+ProductEligibility.sql("r")+" AND r.status='CLOSED' ORDER BY m.code",String.class,run.studentId());
        var choice=chooseNext(run.majorCode(),completed,style);if(choice==null)return null;String primary=choice.primary(),reason=choice.reason();var alternatives=choice.alternatives();String id=PublicIds.next();
        var result=map("schemaVersion","next-recommendation-v1","recommendationId",id,"recommendationType","NEXT","sourceRunId",run.publicId(),"decisionProfileId",run.profileId(),"ruleVersion",NEXT_RULE,"completedMajorCodes",completed,"primaryMajor",primary,"alternativeMajors",alternatives,"reasonCode",reason,"nextWorkStyle",style);
        db.jdbc().update("INSERT INTO mp_recommendation(public_id,student_id,decision_profile_id,recommendation_type,source_run_id,completed_major_codes_json,rule_version,primary_major_code,alternative_order_json,tie_detected,tie_break_rule,explanation_status,explanation_version,generated_at,safe_result_json) VALUES(?,?,?,'NEXT',?,?,?,?,?,FALSE,?,'STRUCTURED_ONLY','next-template-v1',UTC_TIMESTAMP(3),?)",id,run.studentId(),run.profileId(),run.id(),db.json(completed),NEXT_RULE,primary,db.json(alternatives),reason,db.json(result));
        long internal=db.jdbc().queryForObject("SELECT id FROM mp_recommendation WHERE public_id=?",Long.class,id);
        String text=switch(reason){case "ONLY_REMAINING"->"这是尚未完成的另一个专业方向。";case "EXPLICIT_NEXT_STYLE"->"按照你希望继续尝试的工作方式，建议下一次体验这个方向。";default->"建议比较相邻工作方式；这不是对你能力或专业适合度的判定。";};
        db.jdbc().update("INSERT INTO mp_recommendation_reason(recommendation_id,reason_code,reason_type,major_code,reason_order,source_question_keys_json,display_text,rule_version) VALUES(?,?,'RANKING',?,1,?,?,?)",internal,reason,primary,db.json(List.of("nextWorkStyle")),text,NEXT_RULE);return internal;
    }
    record NextChoice(String primary,List<String> alternatives,String reason){}
    /** Called under the same Student lock as the exact historical authorization. */
    void initializeAdoption(Row run,JsonNode reflection){
        if(!db.productEligible(run)||!run.status().equals("CLOSED"))throw new ApiException(409,"PRODUCT_ADOPTION_INVALID");
        if(db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_report WHERE experience_run_id=?",Integer.class,run.id())>0)return;
        Long next=next(run,reflection.path("nextWorkStyle").asText("SKIPPED"));
        db.jdbc().update("INSERT INTO mp_report(public_id,student_id,report_type,experience_run_id,major_id,status,next_recommendation_id) VALUES(?,?,'EXPERIENCE',?,?,'PENDING',?)",PublicIds.next(),run.studentId(),run.id(),run.majorId(),next);
    }
    static NextChoice chooseNext(String current,List<String> completed,String style){
        var candidates=new ArrayList<>(List.of("DATA_SCIENCE","AI","BUSINESS_ANALYTICS"));candidates.removeAll(completed);if(candidates.isEmpty())return null;
        String explicit=switch(style){case "MODEL_ITERATION"->"AI";case "DATA_REASONING"->"DATA_SCIENCE";case "BUSINESS_ACTION"->"BUSINESS_ANALYTICS";default->null;};
        String adjacent=current.equals("DATA_SCIENCE")?"BUSINESS_ANALYTICS":"DATA_SCIENCE";
        String reason=candidates.size()==1?"ONLY_REMAINING":candidates.contains(explicit)?"EXPLICIT_NEXT_STYLE":"ADJACENT_BASELINE";
        String primary=candidates.size()==1?candidates.getFirst():candidates.contains(explicit)?explicit:candidates.contains(adjacent)?adjacent:candidates.getFirst();
        var alternatives=new ArrayList<>(candidates);alternatives.remove(primary);return new NextChoice(primary,List.copyOf(alternatives),reason);
    }
}
