package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.learning.*;
import com.ruoyi.majorpilot.recommendation.NextRecommendations;
import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.experience.RunStore.*;

/** The new edition has its own explicit contract. It never fabricates learning events for v1. */
@Service @Profile("local")
public class MethodReports {
    private final RunStore db;private final TaskContentProvider content;private final GuidedLearning learning;private final NextRecommendations next;
    public MethodReports(RunStore db,TaskContentProvider content,GuidedLearning learning,NextRecommendations next){this.db=db;this.content=content;this.learning=learning;this.next=next;}
    public void enqueue(Row run){
        var report=db.jdbc().queryForMap("SELECT * FROM mp_report WHERE experience_run_id=? AND student_id=?",run.id(),run.studentId());
        if(db.jdbc().queryForObject("SELECT COUNT(*) FROM mp_report_version WHERE report_id=?",Integer.class,n(report,"id"))>0)return;
        create(report,input(run));
        db.jdbc().update("UPDATE mp_run_closure_request SET status='READY' WHERE experience_run_id=?",run.id());
    }
    public ObjectNode input(Row run){
        var task=content.pinned(run.taskPublicId());var row=db.jdbc().queryForMap("SELECT closed_input_manifest_json,closed_input_sha256 FROM mp_experience_run WHERE id=? AND student_id=? AND status='CLOSED'",run.id(),run.studentId());
        var closed=db.node(row.get("closed_input_manifest_json"));if(!db.hash(closed).equals(s(row,"closed_input_sha256"))||!closed.path("taskManifestSha256").asText().equals(task.manifestSha256()))throw invalid();
        var guided=closed.path("learning");if(!guided.equals(db.mapper().valueToTree(learning.freeze(run))))throw invalid();
        var guide=guided.path("guide");MethodGuide.validate(task.manifest(),guide);
        var out=db.mapper().createObjectNode().put("schemaVersion","method-report-input-v1").put("reportType","EXPERIENCE");
        var taskRef=out.putArray("runs").addObject().put("majorCode",run.majorCode()).put("experienceRunId",run.publicId()).put("taskVersionId",task.taskVersionId()).put("taskVersionCode",task.versionCode()).put("taskTitle",task.manifest().path("title").asText()).put("taskManifestSha256",task.manifestSha256()).put("closedInputSha256",s(row,"closed_input_sha256"));taskRef.putNull("sourceReport");taskRef.set("method",guide.deepCopy());
        var sources=out.putArray("sources");var checkpoints=out.putArray("checkpoints");var materials=taskRef.putArray("materials");
        var keys=run.majorCode().equals("AI")?List.of("classifier-model","practice-public","baseline-summary"):run.majorCode().equals("DATA_SCIENCE")?List.of("learner-activity","data-dictionary"):List.of("weekly-funnel","data-dictionary");
        for(String key:keys){var asset=content.publicAsset(task,key);var m=materials.addObject().put("key",key).put("sha256",asset.sha256());try{m.set("content",db.mapper().readTree(asset.bytes()));}catch(Exception e){throw invalid();}}
        var finalAnswers=taskRef.putArray("finalAnswers");
        for(var frozen:closed.path("steps")){
            var values=db.jdbc().queryForList("SELECT r.response_json,r.content_sha256 FROM mp_step_response_revision r JOIN mp_step_state s ON s.id=r.step_state_id WHERE r.id=? AND s.experience_run_id=? AND s.step_key=? AND r.revision_no=?",frozen.path("revisionId").asLong(),run.id(),frozen.path("stepKey").asText(),frozen.path("revision").asLong());if(values.size()!=1)throw invalid();var value=values.getFirst();JsonNode answer=db.node(value.get("response_json"));
            if(!s(value,"content_sha256").equals(frozen.path("sha256").asText())||!db.hash(answer).equals(frozen.path("valueSha256").asText()))throw invalid();
            var step=MethodGuide.step(guide.path("steps"),frozen.path("stepKey").asText());var definition=MethodGuide.step(task.manifest().path("steps"),step.path("stepKey").asText());TaskInputValidator.validate(definition.path("inputSchema"),answer,true);
            finalAnswers.addObject().put("stepKey",step.path("stepKey").asText()).put("title",step.path("title").asText()).set("answer",answer);
            for(var field:step.path("fields")){String key=field.path("key").asText();if(key.equals("transfer")&&answer.path("transferMode").asText().equals("SKIP")){source(sources,run.majorCode(),"OBSERVATION","","","新情境题未作答","学生明确选择这次不作答新情境题；没有迁移响应记录。",false,false);continue;}boolean open=!field.has("options");source(sources,run.majorCode(),"FINAL",step.path("checkpointId").asText(step.path("transferCheckpointId").asText("")),"FINAL",step.path("title").asText()+" · "+field.path("label").asText(),answer.path(key).asText(),open,true);}
            if(answer.has("local"))source(sources,run.majorCode(),"FINAL",step.path("checkpointId").asText(""),"FINAL",step.path("title").asText()+" · 本地处理说明",answer.at("/local/reason").asText(),true,true);
        }
        for(var cp:guide.path("checkpoints")){
            String cpId=cp.path("checkpointId").asText();var c=checkpoints.addObject().put("checkpointId",cpId).put("majorCode",run.majorCode()).put("title",MethodGuide.step(guide.path("steps"),cp.path("stepKey").asText()).path("title").asText());c.set("criteria",cp.path("criteria"));c.set("dependencies",cp.path("dependencies"));var conditions=c.putArray("supportConditions");
            for(var e:guided.at("/timeline/events"))if(e.path("checkpointId").asText().equals(cpId)){
                var payload=e.path("payload");String kind=e.path("kind").asText();
                if(kind.equals("ATTEMPT_SUBMITTED")){String role=payload.path("role").asText();var st=MethodGuide.step(guide.path("steps"),payload.path("responseStepKey").asText());for(var f:st.path("fields"))source(sources,run.majorCode(),"ATTEMPT",cpId,role,(role.equals("INITIAL")?"初次提交":role.equals("REVISION")?"修订提交":"新情境提交")+" · "+f.path("label").asText(),payload.path("answer").path(f.path("key").asText()).asText(),false,true);if(payload.path("answer").has("local")){source(sources,run.majorCode(),"ATTEMPT",cpId,role,(role.equals("INITIAL")?"初次提交":"修订提交")+" · 本地处理说明",payload.at("/answer/local/reason").asText(),false,true);source(sources,run.majorCode(),"ATTEMPT_CONTEXT",cpId,role,"该次明确提交时的本地结果与处理规则",payload.at("/answer/local").toString(),false,false);}}
                else if(kind.equals("SUPPORT_PROVIDED")||kind.equals("BASELINE_SELECTED")){String id=payload.path("supportId").asText();JsonNode help=null;for(var h:cp.path("supports"))if(h.path("supportId").asText().equals(id))help=h;if(help==null)throw invalid();String label=kind.equals("BASELINE_SELECTED")?"已选择系统中间说明（不是学生成果）":help.path("kind").asText().equals("BASIC")?"基础讲解已提供":"额外提示已提供";conditions.add(label);source(sources,run.majorCode(),"SUPPORT",cpId,"",label,help.path("text").asText(),false,false);}
                else if(kind.equals("CONTINUE_WITH_SUPPORT"))conditions.add("选择带着现有帮助继续，未声称已理解");
            }
        }
        for(var result:guided.path("localResults"))source(sources,run.majorCode(),"LOCAL_RESULT","","",result.path("assistance").asBoolean()?"明确请求的网站辅助计算（不是独立成果）":"本地回填及核对结果",result.toString(),false,false);
        for(var e:closed.path("executions")){var executions=db.jdbc().queryForList("SELECT result_json FROM mp_execution_record WHERE id=? AND experience_run_id=? AND status='SUCCEEDED' AND trust_level='SERVER_VERIFIED'",e.path("executionId").asLong(),run.id());if(executions.size()!=1)throw invalid();var result=db.node(executions.getFirst().get("result_json"));if(!db.hash(result).equals(e.path("resultSha256").asText()))throw invalid();source(sources,run.majorCode(),"EXECUTION","AI-C3","","当前配置的服务端核对结果",result.toString(),false,false);}
        var reflections=db.jdbc().queryForMap("SELECT draft_json,row_version FROM mp_reflection WHERE id=? AND experience_run_id=? AND status='SUBMITTED'",closed.path("reflectionId").asLong(),run.id());var reflection=db.node(reflections.get("draft_json"));if(!db.hash(reflection).equals(closed.path("reflectionSha256").asText())||n(reflections,"row_version")!=closed.path("reflectionRevision").asLong())throw invalid();
        source(sources,run.majorCode(),"REFLECTION","","","本人对兴趣、困难和继续意愿的反思",reflection.toString(),false,false);
        out.set("nextRecommendation",db.mapper().valueToTree(next.projection(run.studentId(),run.id())));return out;
    }
    private void source(ArrayNode sources,String major,String kind,String checkpoint,String role,String label,String value,boolean required,boolean studentText){sources.addObject().put("ref",major+"-s"+(sources.size()+1)).put("majorCode",major).put("kind",kind).put("checkpointId",checkpoint).put("role",role).put("label",label).put("value",value).put("requiredFinding",required).put("studentText",studentText);}
    public Map<String,Object> create(Map<String,Object> report,JsonNode input){
        if(report.get("generation_target_version_id")!=null)throw new ApiException(409,"REPORT_REGENERATION_IN_PROGRESS");
        String id=PublicIds.next(),sha=db.hash(input);long no=db.jdbc().queryForObject("SELECT COALESCE(MAX(version_no),0)+1 FROM mp_report_version WHERE report_id=?",Long.class,n(report,"id"));
        var request=map("schemaVersion","method-report-request-v1","inputSha256",sha,"reportId",s(report,"public_id"),"reportVersionId",id,"reviewRequired",true);
        db.jdbc().update("INSERT INTO mp_report_version(public_id,report_id,version_no,generation_phase,request_manifest_json,request_manifest_sha256,input_manifest_json,source_manifest_sha256,next_recommendation_id,template_version,prompt_version,schema_version,claim_rule_version,review_required,review_policy_version) VALUES(?,?,?,'PREPARED',?,?,?,?,?,'method-report-template-v1',?,'method-report-v1','method-report-source-v1',TRUE,'report-review-rewrite-v1')",id,n(report,"id"),no,db.json(request),db.hash(db.mapper().valueToTree(request)),db.json(input),sha,nullable(report,"next_recommendation_id"),MethodReportContract.PROMPT);
        var version=db.jdbc().queryForMap("SELECT * FROM mp_report_version WHERE public_id=?",id);db.jdbc().update("UPDATE mp_report SET generation_target_version_id=?,status=IF(current_version_id IS NULL,'GENERATING','READY'),row_version=row_version+1 WHERE id=?",n(version,"id"),n(report,"id"));
        db.jdbc().update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_student_id,target_type,target_id,checkpoint_json) VALUES(?,'METHOD_REPORT',?,?,'REPORT_VERSION',?,?)",PublicIds.next(),"method-report:"+id,n(report,"student_id"),n(version,"id"),db.json(map("inputSha256",sha)));
        return version;
    }
    /** Latest ready source per Major; legacy sources retain their published limitations, no invented timeline. */
    public void comparison(long student){comparison(student,false);}
    public void comparison(long student,boolean force){
        var rows=db.jdbc().queryForList("SELECT v.*,r.major_id,r.experience_run_id,r.public_id AS report_public_id FROM mp_report r JOIN mp_report_version v ON v.id=r.current_version_id JOIN mp_experience_run er ON er.id=r.experience_run_id WHERE r.student_id=? AND r.report_type='EXPERIENCE' AND v.status='READY' ORDER BY er.experience_edition DESC,v.id DESC",student);
        var byMajor=new TreeMap<Long,Map<String,Object>>();for(var r:rows)byMajor.putIfAbsent(n(r,"major_id"),r);if(byMajor.size()<2||byMajor.values().stream().noneMatch(v->s(v,"schema_version").equals(MethodReportContract.SCHEMA)))return;
        var reports=db.jdbc().queryForList("SELECT * FROM mp_report WHERE student_id=? AND report_type='COMPARISON'",student);
        if(reports.isEmpty()){db.jdbc().update("INSERT INTO mp_report(public_id,student_id,report_type,status) VALUES(?,?,'COMPARISON','PENDING')",PublicIds.next(),student);reports=db.jdbc().queryForList("SELECT * FROM mp_report WHERE student_id=? AND report_type='COMPARISON'",student);}
        var report=reports.getFirst();if(report.get("generation_target_version_id")!=null)return;
        var input=db.mapper().createObjectNode().put("schemaVersion","method-report-input-v1").put("reportType","COMPARISON");var runs=input.putArray("runs");var sources=input.putArray("sources");var checkpoints=input.putArray("checkpoints");
        for(var v:byMajor.values()){var original=s(v,"schema_version").equals(MethodReportContract.SCHEMA)?db.node(v.get("input_manifest_json")):legacyInput(student,v);if(s(v,"schema_version").equals(MethodReportContract.SCHEMA)&&!db.hash(original).equals(s(v,"source_manifest_sha256")))throw invalid();var task=(ObjectNode)original.path("runs").get(0).deepCopy();task.set("sourceReport",db.mapper().valueToTree(map("reportId",s(v,"report_public_id"),"reportVersionId",s(v,"public_id"),"versionNo",n(v,"version_no"))));runs.add(task);original.path("sources").forEach(s->sources.add(s.deepCopy()));original.path("checkpoints").forEach(c->checkpoints.add(c.deepCopy()));}
        input.set("nextRecommendation",db.mapper().valueToTree(next.projection(student,null)));
        if(!force&&report.get("current_version_id")!=null){var current=db.jdbc().queryForMap("SELECT schema_version,source_manifest_sha256 FROM mp_report_version WHERE id=?",n(report,"current_version_id"));if(s(current,"schema_version").equals(MethodReportContract.SCHEMA)&&db.hash(input).equals(s(current,"source_manifest_sha256")))return;}
        var version=create(report,input);for(var v:byMajor.values())db.jdbc().update("INSERT INTO mp_comparison_source(comparison_report_version_id,source_experience_report_version_id,major_id) VALUES(?,?,?)",n(version,"id"),n(v,"id"),n(v,"major_id"));
    }
    public Map<String,Object> regenerate(long student,String reportId){var report=db.jdbc().queryForMap("SELECT * FROM mp_report WHERE public_id=? AND student_id=?",reportId,student);if(!s(report,"report_type").equals("EXPERIENCE"))throw new ApiException(422,"METHOD_REPORT_INVALID");var run=db.internal(n(report,"experience_run_id"));return create(report,input(run));}
    private ObjectNode legacyInput(long student,Map<String,Object> version){
        var body=db.node(version.get("structured_report_json"));if(!new com.ruoyi.majorpilot.report.core.ReportSchema(db.mapper()).output(body)||!db.hash(body).equals(s(version,"report_body_sha256")))throw invalid();
        var run=db.internal(n(version,"experience_run_id"));if(run.studentId()!=student||!run.status().equals("CLOSED"))throw invalid();var task=content.pinned(run.taskPublicId());
        var closed=db.jdbc().queryForMap("SELECT closed_input_manifest_json,closed_input_sha256 FROM mp_experience_run WHERE id=?",run.id());if(!db.hash(db.node(closed.get("closed_input_manifest_json"))).equals(s(closed,"closed_input_sha256")))throw invalid();
        var out=db.mapper().createObjectNode();var item=out.putArray("runs").addObject().put("majorCode",run.majorCode()).put("experienceRunId",run.publicId()).put("taskVersionId",task.taskVersionId()).put("taskVersionCode",task.versionCode()).put("taskTitle",task.manifest().path("title").asText()).put("taskManifestSha256",task.manifestSha256()).put("closedInputSha256",s(closed,"closed_input_sha256"));
        item.putObject("method").put("methodName","旧版体验：仅按当时记录比较").put("scope","旧版没有初次、修订和帮助的完整过程记录，无法判断何时理解或如何学会。只引用旧报告已发布的有限观察，不按新版要求重新评分。");item.set("legacyPublishedReport",body);out.putArray("checkpoints");var sources=out.putArray("sources");
        for(var section:body.path("sections"))for(var claim:section.path("claims"))source(sources,run.majorCode(),claim.path("claimType").asText().equals("STUDENT_SELF_REPORT")?"REFLECTION":"LEGACY_PUBLISHED_CLAIM","","","旧版已发布报告 · "+section.path("title").asText(),claim.path("text").asText(),false,false);
        return out;
    }
    private static ApiException invalid(){return new ApiException(409,"REPORT_SOURCE_INVALID");}
}
