package com.ruoyi.majorpilot.report;

import com.ruoyi.majorpilot.report.core.*;
import com.ruoyi.majorpilot.report.core.ReportModels.*;
import com.ruoyi.majorpilot.recommendation.NextRecommendations;
import com.ruoyi.majorpilot.shared.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.report.ReportStore.*;

/** Only short database transactions. Never calls a model. */
@Service @Profile("local")
public class ReportCoordinator {
    private final ReportStore store;private final NextRecommendations next;private final ReportCore core;
    public ReportCoordinator(ReportStore store,NextRecommendations next,ReportCore core){this.store=store;this.next=next;this.core=core;}
    private ReportCore core(){return core;}
    public void evidenceReady(long run,long snapshot,long job){
        var j=store.db().queryForMap("SELECT * FROM mp_background_job WHERE id=?",job);
        ReportStore.require(store.db().queryForObject("SELECT COUNT(*) FROM mp_evidence_snapshot WHERE id=? AND experience_run_id=? AND student_id=? AND status='READY' AND (origin_job_id=? OR origin_job_id IS NULL)",Integer.class,snapshot,run,n(j,"owner_student_id"),job)==1);
        if("REPORT_VERSION".equals(s(j,"target_type"))){var version=store.version(n(j,"target_id"));var report=store.report(n(version,"report_id"));if(!Objects.equals(nullable(report,"generation_target_version_id"),n(version,"id"))||!"GENERATING".equals(s(version,"status")))return;prepare(report,version,List.of(store.source(n(report,"student_id"),snapshot,null)));return;}
        var reports=store.db().queryForList("SELECT p.* FROM mp_report p JOIN mp_experience_run r ON r.id=p.experience_run_id WHERE p.experience_run_id=? AND r.run_mode='STANDARD' AND r.content_kind='MAJOR' AND r.status='CLOSED'",run);
        if(reports.isEmpty())return;var report=reports.getFirst();if(store.db().queryForObject("SELECT COUNT(*) FROM mp_report_version WHERE report_id=?",Integer.class,n(report,"id"))>0)return;
        var source=store.source(n(report,"student_id"),snapshot,null);var request=map("schemaVersion","report-request-v1","reportId",s(report,"public_id"),"reportType","EXPERIENCE","runId",source.pins().runId(),"closedInputSha256",source.pins().closedInputSha256(),"evidenceMode","INITIAL","targetEvidenceRuleVersion",source.snapshot().effectiveRule(),"nextRecommendation",next.projection(n(report,"student_id"),run),"sourceVersionIds",List.of());
        var version=create(report,request);prepare(report,version,List.of(source));
    }
    public Map<String,Object> create(Map<String,Object> report,Map<String,Object> request){
        long id=n(report,"id");if(report.get("generation_target_version_id")!=null)throw new ApiException(409,"REPORT_REGENERATION_IN_PROGRESS");
        long number=store.db().queryForObject("SELECT COALESCE(MAX(version_no),0)+1 FROM mp_report_version WHERE report_id=?",Long.class,id);String publicId=PublicIds.next();var pins=VersionPins.v1();Instant timestamp=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        store.db().update("INSERT INTO mp_report_version(public_id,report_id,version_no,request_manifest_json,request_manifest_sha256,next_recommendation_id,template_version,prompt_version,schema_version,claim_rule_version,rendered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",publicId,id,number,store.json(request),store.hash(store.mapper().valueToTree(request)),nullable(report,"next_recommendation_id"),pins.templateVersion(),pins.promptVersion(),pins.outputSchemaVersion(),pins.claimRuleVersion(),Timestamp.from(timestamp));
        var version=store.db().queryForMap("SELECT * FROM mp_report_version WHERE public_id=?",publicId);
        store.db().update("UPDATE mp_report SET generation_target_version_id=?,status=IF(current_version_id IS NULL,'GENERATING','READY'),row_version=row_version+1 WHERE id=?",n(version,"id"),id);
        event(n(report,"student_id"),id,n(version,"id"),"report.generation.started",map("reportType",s(report,"report_type"),"generationMode",null,"templateVersion",pins.templateVersion()));return version;
    }
    public void prepare(Map<String,Object> report,Map<String,Object> version,List<Source> sources){
        store.validateRequest(version);var request=store.node(version.get("request_manifest_json"));NextProjection projection;
        try{projection=store.mapper().treeToValue(request.path("nextRecommendation"),NextProjection.class);}catch(Exception bad){throw new ApiException(409,"REPORT_SOURCE_INVALID");}
        String student=store.db().queryForObject("SELECT public_id FROM mp_student_account WHERE id=?",String.class,n(report,"student_id"));
        var input=new ReportInput(new Header(s(report,"public_id"),s(version,"public_id"),(int)n(version,"version_no"),ReportType.valueOf(s(report,"report_type")),student,time(version,"rendered_at")),VersionPins.v1(),sources,projection);
        var catalog=core().compile(input);var tree=store.mapper().valueToTree(input);var snapshots=sources.stream().map(s->s.snapshot().snapshotId()).toList();var profiles=sources.stream().map(s->s.pins().decisionProfileId()).toList();
        if(version.get("input_manifest_json")!=null){if(!store.hash(tree).equals(s(version,"source_manifest_sha256")))throw new ApiException(409,"REPORT_SOURCE_INVALID");return;}
        store.db().update("UPDATE mp_report_version SET input_manifest_json=?,source_manifest_sha256=?,evidence_snapshot_ids_json=?,decision_profile_ids_json=?,claim_catalog_sha256=?,generation_phase='PREPARED' WHERE id=? AND input_manifest_json IS NULL",store.json(input),store.hash(tree),store.json(snapshots),store.json(profiles),catalog.catalogSha256(),n(version,"id"));
        String type=s(report,"report_type").equals("COMPARISON")?"COMPARISON_GENERATE":"REPORT_GENERATE";String key=(type.equals("COMPARISON_GENERATE")?"comparison:":"report:")+s(version,"public_id");
        store.db().update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_student_id,target_type,target_id,target_version,checkpoint_json) VALUES(?,?,?,?,'REPORT_VERSION',?,?,?)",PublicIds.next(),type,key,n(report,"student_id"),n(version,"id"),n(version,"version_no"),store.json(map("reportVersionId",s(version,"public_id"),"sourceManifestSha256",store.hash(tree))));
    }
    public void compare(long student){compare(student,false);}
    public void compare(long student,boolean explicitRegeneration){
        var sources=store.db().queryForList("SELECT v.*,p.public_id AS report_public_id,p.major_id,m.code AS major_code FROM mp_report p JOIN mp_report_version v ON v.id=p.current_version_id JOIN mp_major m ON m.id=p.major_id WHERE p.student_id=? AND p.report_type='EXPERIENCE' AND v.status='READY' ORDER BY m.code",student);
        if(sources.size()<2)return;var reports=store.db().queryForList("SELECT * FROM mp_report WHERE student_id=? AND report_type='COMPARISON'",student);
        Map<String,Object> report;if(reports.isEmpty()){String id=PublicIds.next();store.db().update("INSERT INTO mp_report(public_id,student_id,report_type,status) VALUES(?,?,'COMPARISON','PENDING')",id,student);report=store.owned(student,id);}else report=reports.getFirst();
        var tuple=sources.stream().map(v->s(v,"public_id")).toList();
        for(String pointer:List.of("generation_target_version_id","current_version_id")){if(report.get(pointer)==null)continue;var old=store.version(n(report,pointer));var recorded=store.node(old.get("request_manifest_json")).path("sourceVersionIds");if(recorded.equals(store.mapper().valueToTree(tuple))&&(!explicitRegeneration||pointer.equals("generation_target_version_id")))return;}
        if(report.get("generation_target_version_id")!=null){long old=n(report,"generation_target_version_id");store.db().update("UPDATE mp_report_version SET status='FAILED',failure_code='COMPARISON_SOURCE_STALE',completed_at=UTC_TIMESTAMP(3) WHERE id=? AND status='GENERATING'",old);store.db().update("UPDATE mp_background_job SET status='CANCELLED',last_error_code='COMPARISON_SOURCE_STALE',lease_until=NULL,completed_at=UTC_TIMESTAMP(3) WHERE target_type='REPORT_VERSION' AND target_id=? AND status IN ('PENDING','RUNNING','RETRY_WAIT')",old);store.db().update("UPDATE mp_report SET generation_target_version_id=NULL WHERE id=?",n(report,"id"));report=new LinkedHashMap<>(report);report.put("generation_target_version_id",null);}
        var request=map("schemaVersion","report-request-v1","reportId",s(report,"public_id"),"reportType","COMPARISON","evidenceMode","REUSE_READY_EVIDENCE","targetEvidenceRuleVersion",null,"nextRecommendation",next.projection(student,null),"sourceVersionIds",tuple);
        var version=create(report,request);var inputs=new ArrayList<Source>();for(var v:sources){var input=store.input(v);store.verifyInput(input,false);if(input.sources().size()!=1)throw new ApiException(409,"REPORT_SOURCE_INVALID");var original=input.sources().getFirst();var ref=new ExperienceVersionRef(s(v,"report_public_id"),s(v,"public_id"),(int)n(v,"version_no"),s(v,"report_body_sha256"),store.node(v.get("structured_report_json")));inputs.add(new Source(original.majorCode(),original.studentPublicId(),original.pins(),original.snapshot(),original.items(),ref));store.db().update("INSERT INTO mp_comparison_source(comparison_report_version_id,source_experience_report_version_id,major_id) VALUES(?,?,?)",n(version,"id"),n(v,"id"),n(v,"major_id"));}
        prepare(report,version,inputs);
    }
    public void event(long student,long report,long version,String name,Map<String,Object> fields){store.db().update("INSERT INTO mp_product_event(event_id,event_name,event_version,source,occurred_at,received_at,student_id,report_id,report_version_id,properties_json) VALUES(?,?,'v1','BACKEND',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?,?,?,?)",PublicIds.next(),name,student,report,version,store.json(fields));}
    @Scheduled(fixedDelay=5000) public void reconcile(){
        var rows=store.db().queryForList("SELECT p.id,p.student_id,p.experience_run_id FROM mp_report p WHERE p.report_type='EXPERIENCE' AND p.status='PENDING' AND NOT EXISTS(SELECT 1 FROM mp_report_version v WHERE v.report_id=p.id) ORDER BY p.id LIMIT 20");
        for(var row:rows)try{store.tx().executeWithoutResult(status->{store.active(n(row,"student_id"));var jobs=store.db().queryForList("SELECT id,checkpoint_json FROM mp_background_job WHERE job_type='EVIDENCE_BUILD' AND target_type='EXPERIENCE_RUN' AND target_id=? AND status='SUCCEEDED' ORDER BY id LIMIT 1",n(row,"experience_run_id"));if(!jobs.isEmpty()){var j=jobs.getFirst();long snapshot=store.node(j.get("checkpoint_json")).path("snapshotId").asLong();if(snapshot>0)evidenceReady(n(row,"experience_run_id"),snapshot,n(j,"id"));}});}catch(ReportInputException invalid){reconciliationFailed(row);}catch(ApiException invalid){if(Set.of("REPORT_SOURCE_INVALID","REPORT_CATALOG_INVALID","EVIDENCE_RULE_UNSUPPORTED").contains(invalid.code))reconciliationFailed(row);}
    }
    private void reconciliationFailed(Map<String,Object> row){store.tx().executeWithoutResult(tx->{var account=store.db().queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",n(row,"student_id"));if(account.isEmpty()||!"ACTIVE".equals(s(account.getFirst(),"status")))return;store.db().update("UPDATE mp_report SET status='FAILED',row_version=row_version+1 WHERE id=? AND student_id=? AND status='PENDING' AND NOT EXISTS(SELECT 1 FROM mp_report_version v WHERE v.report_id=?)",n(row,"id"),n(row,"student_id"),n(row,"id"));});}
}
