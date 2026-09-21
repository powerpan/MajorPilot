package com.ruoyi.majorpilot.retention;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.privacy.PrivateObjectStore;
import com.ruoyi.majorpilot.shared.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.BooleanSupplier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Bounded, repeatable cleanup. Object keys remain tracked until every associated delete succeeds. */
@Service @Profile("local")
public class RetentionService {
    private final JdbcTemplate db;private final TransactionTemplate tx;private final ObjectMapper mapper;private final PrivateObjectStore files;
    public RetentionService(JdbcTemplate db,TransactionTemplate tx,ObjectMapper mapper,PrivateObjectStore files){this.db=db;this.tx=tx;this.mapper=mapper;this.files=files;}
    public long run(RetentionPolicy policy,Instant asOf,int batch,BooleanSupplier lease){RetentionPolicy.checkedBatch(batch);Objects.requireNonNull(asOf);return tx.execute(t->{fence(lease);long count=switch(policy){
        case AI_METADATA -> metadata("mp_ai_call","created_at",policy.cutoff(asOf),batch,"x.status<>'IN_PROGRESS' AND NOT EXISTS(SELECT 1 FROM mp_report_version v WHERE v.id=x.report_version_id AND v.status='GENERATING')",false);
        case PRODUCT_EVENTS -> metadata("mp_product_event","received_at",policy.cutoff(asOf),batch,"1=1",false);
        case SENSITIVE_AUDITS -> metadata("mp_sensitive_audit","occurred_at",policy.cutoff(asOf),batch,"1=1",true);
        case TERMINAL_JOBS -> jobs(asOf,batch);
        case EXPORT_FILES -> exports(asOf,batch,false);
        case EXPORT_METADATA -> exports(asOf,batch,true);
        case UNCONFIRMED_DELETIONS -> unconfirmed(policy.cutoff(asOf),asOf,batch);
        case EXPIRED_RECEIPTS -> receipts(asOf,batch);
        case STALE_PARTIALS -> files.deletePartialsBefore(policy.cutoff(asOf),batch);
    };fence(lease);return count;});}
    private static void fence(BooleanSupplier lease){if(!lease.getAsBoolean())throw new ApiException(409,"RETENTION_LEASE_LOST");}
    private static long n(Map<String,Object> r,String k){return ((Number)r.get(k)).longValue();}
    private static Long nullable(Map<String,Object> r,String k){return r.get(k)==null?null:n(r,k);}
    private static String s(Map<String,Object> r,String k){return (String)r.get(k);}
    private boolean student(Long id){if(id==null)return true;var rows=db.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",id);return !rows.isEmpty()&&!Set.of("DELETION_PENDING","DELETED").contains(s(rows.getFirst(),"status"));}
    private Map<Long,Boolean> students(Collection<Long> ids){var result=new HashMap<Long,Boolean>();var sorted=new TreeSet<Long>();for(Long id:ids)if(id!=null)sorted.add(id);for(long id:sorted)result.put(id,student(id));return result;}
    private JsonNode json(Object raw){try{return raw==null?mapper.createObjectNode():mapper.readTree(raw.toString());}catch(Exception invalid){throw new ApiException(409,"RETENTION_SOURCE_INVALID");}}
    private String string(Object value){try{return mapper.writeValueAsString(value);}catch(Exception invalid){throw new ApiException(409,"RETENTION_SOURCE_INVALID");}}
    private long metadata(String table,String date,Instant cutoff,int batch,String extra,boolean audit){
        // All identifiers above are compile-time policy constants, never input strings.
        String owner=audit?"owner_student_id":"student_id";long count=0;
        var rows=db.queryForList("SELECT x.id,x."+owner+" AS student_id FROM "+table+" x WHERE x."+date+"<? AND "+extra+" AND NOT EXISTS(SELECT 1 FROM mp_student_account a WHERE a.id=x."+owner+" AND a.status IN ('DELETION_PENDING','DELETED')) ORDER BY x.id LIMIT ?",Timestamp.from(cutoff),batch);
        var allowed=students(rows.stream().map(r->nullable(r,"student_id")).toList());for(var row:rows){Long ownerId=nullable(row,"student_id");if(ownerId!=null&&!allowed.get(ownerId))continue;count+=db.update("DELETE x FROM "+table+" x WHERE x.id=? AND x."+date+"<? AND "+extra,n(row,"id"),Timestamp.from(cutoff));}return count;
    }
    private long jobs(Instant asOf,int batch){
        var rows=db.queryForList("SELECT j.id,j.owner_student_id FROM mp_background_job j WHERE j.job_type IN ('EVIDENCE_BUILD','EVIDENCE_REBUILD','REPORT_GENERATE','COMPARISON_GENERATE','RETENTION_CLEANUP') AND ((j.status='SUCCEEDED' AND j.completed_at<?) OR (j.status IN ('FAILED','CANCELLED') AND j.completed_at<?)) AND NOT EXISTS(SELECT 1 FROM mp_student_account a WHERE a.id=j.owner_student_id AND a.status IN ('DELETION_PENDING','DELETED')) AND NOT EXISTS(SELECT 1 FROM mp_evidence_snapshot s WHERE s.origin_job_id=j.id AND s.status='BUILDING') AND NOT(j.job_type='EVIDENCE_BUILD' AND (EXISTS(SELECT 1 FROM mp_run_closure_request c WHERE c.experience_run_id=j.target_id AND c.status='PENDING') OR EXISTS(SELECT 1 FROM mp_report p WHERE p.experience_run_id=j.target_id AND p.status='PENDING' AND NOT EXISTS(SELECT 1 FROM mp_report_version v WHERE v.report_id=p.id)))) AND NOT(j.target_type='REPORT_VERSION' AND EXISTS(SELECT 1 FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE v.id=j.target_id AND (v.status='GENERATING' OR r.generation_target_version_id=v.id))) ORDER BY j.id LIMIT ?",Timestamp.from(asOf.minus(Duration.ofDays(30))),Timestamp.from(asOf.minus(Duration.ofDays(90))),batch);long count=0;
        var allowed=students(rows.stream().map(r->nullable(r,"owner_student_id")).toList());for(var row:rows){Long owner=nullable(row,"owner_student_id");if(owner!=null&&!allowed.get(owner))continue;var locked=db.queryForList("SELECT * FROM mp_background_job WHERE id=? AND status IN ('SUCCEEDED','FAILED','CANCELLED') FOR UPDATE SKIP LOCKED",n(row,"id"));if(locked.isEmpty())continue;var job=locked.getFirst();long id=n(job,"id");
            if("EVIDENCE_BUILD".equals(s(job,"job_type"))){if(!"EXPERIENCE_RUN".equals(s(job,"target_type")))continue;if(db.queryForObject("SELECT COUNT(*) FROM mp_run_closure_request WHERE experience_run_id=? AND status='PENDING'",Integer.class,n(job,"target_id"))>0)continue;if(db.queryForObject("SELECT COUNT(*) FROM mp_report p WHERE p.experience_run_id=? AND p.status='PENDING' AND NOT EXISTS(SELECT 1 FROM mp_report_version v WHERE v.report_id=p.id)",Integer.class,n(job,"target_id"))>0)continue;}
            else if(!"RETENTION_CLEANUP".equals(s(job,"job_type"))){if(!"REPORT_VERSION".equals(s(job,"target_type")))continue;if(db.queryForObject("SELECT COUNT(*) FROM mp_report_version v JOIN mp_report r ON r.id=v.report_id WHERE v.id=? AND (v.status='GENERATING' OR r.generation_target_version_id=v.id)",Integer.class,n(job,"target_id"))>0)continue;}
            if(db.queryForObject("SELECT COUNT(*) FROM mp_evidence_snapshot WHERE origin_job_id=? AND status='BUILDING'",Integer.class,id)>0)continue;
            // Metadata relationship only: immutable snapshot body/rule/hash are untouched.
            db.update("UPDATE mp_evidence_snapshot SET origin_job_id=NULL WHERE origin_job_id=? AND status IN ('READY','FAILED')",id);count+=db.update("DELETE FROM mp_background_job WHERE id=? AND status IN ('SUCCEEDED','FAILED','CANCELLED')",id);
        }return count;
    }
    private long exports(Instant asOf,int batch,boolean metadata){
        Instant cutoff=metadata?asOf.minus(Duration.ofDays(30)):asOf;
        var candidates=db.queryForList("SELECT x.id,'STUDENT' AS kind FROM mp_student_data_export x WHERE "+exportCondition(metadata,false)+" AND NOT EXISTS(SELECT 1 FROM mp_student_account a WHERE a.id=x.student_id AND a.status IN ('DELETION_PENDING','DELETED')) UNION ALL SELECT x.id,'ADMIN' AS kind FROM mp_admin_export x WHERE "+exportCondition(metadata,true)+" AND NOT EXISTS(SELECT 1 FROM mp_admin_export_student m JOIN mp_student_account a ON a.id=m.student_id WHERE m.export_id=x.id AND a.status IN ('DELETION_PENDING','DELETED')) ORDER BY id,kind LIMIT ?",Timestamp.from(cutoff),Timestamp.from(cutoff),batch);long count=0;
        var allStudents=new TreeSet<Long>();var allOperators=new TreeSet<Long>();for(var c:candidates){if("ADMIN".equals(s(c,"kind"))){allStudents.addAll(db.queryForList("SELECT student_id FROM mp_admin_export_student WHERE export_id=?",Long.class,n(c,"id")));allOperators.addAll(db.queryForList("SELECT operator_id FROM mp_admin_export WHERE id=?",Long.class,n(c,"id")));}else allStudents.addAll(db.queryForList("SELECT student_id FROM mp_student_data_export WHERE id=?",Long.class,n(c,"id")));}students(allStudents);for(long operator:allOperators)db.queryForList("SELECT user_id FROM sys_user WHERE user_id=? FOR UPDATE",operator);
        for(var candidate:candidates){boolean admin="ADMIN".equals(s(candidate,"kind"));String table=admin?"mp_admin_export":"mp_student_data_export",type=admin?"ADMIN_EXPORT":"STUDENT_EXPORT",target=admin?"ADMIN_EXPORT":"STUDENT_DATA_EXPORT";long id=n(candidate,"id");
            var known=db.queryForList("SELECT * FROM "+table+" WHERE id=?",id);if(known.isEmpty())continue;var initial=known.getFirst();List<Long> members=admin?db.queryForList("SELECT student_id FROM mp_admin_export_student WHERE export_id=? ORDER BY student_id",Long.class,id):List.of(n(initial,"student_id"));boolean available=true;for(long member:members)if(!student(member))available=false;if(!available)continue;
            if(admin)db.queryForList("SELECT user_id FROM sys_user WHERE user_id=? FOR UPDATE",n(initial,"operator_id"));
            var records=db.queryForList("SELECT x.* FROM "+table+" x WHERE x.id=? AND "+exportCondition(metadata,admin)+" FOR UPDATE SKIP LOCKED",id,Timestamp.from(cutoff));if(records.isEmpty())continue;var export=records.getFirst();
            if(admin&&!members.equals(db.queryForList("SELECT student_id FROM mp_admin_export_student WHERE export_id=? ORDER BY student_id",Long.class,id)))continue;
            var jobs=db.queryForList("SELECT * FROM mp_background_job WHERE job_type=? AND target_type=? AND target_id=? FOR UPDATE",type,target,id);if(jobs.stream().anyMatch(j->Set.of("PENDING","RUNNING","RETRY_WAIT").contains(s(j,"status"))))continue;
            for(var j:jobs)if(admin?j.get("owner_student_id")!=null||!Objects.equals(nullable(j,"owner_operator_id"),n(export,"operator_id")):j.get("owner_operator_id")!=null||!Objects.equals(nullable(j,"owner_student_id"),n(export,"student_id")))throw new ApiException(409,"RETENTION_SOURCE_INVALID");
            var keys=new LinkedHashSet<String>();if(export.get("object_key")!=null)keys.add(s(export,"object_key"));for(var j:jobs){var value=json(j.get("checkpoint_json")).path("artifactKeys");if(!value.isMissingNode()&&!value.isArray())throw new ApiException(409,"RETENTION_SOURCE_INVALID");if(value.size()>3)throw new ApiException(409,"RETENTION_SOURCE_INVALID");for(var key:value){if(!key.isTextual())throw new ApiException(409,"RETENTION_SOURCE_INVALID");keys.add(key.textValue());}}
            for(String key:keys){if(!key.startsWith(admin?"admin/":"student/"))throw new ApiException(409,"RETENTION_SOURCE_INVALID");files.delete(key);}
            // No tracking is cleared until all file operations above succeeded.
            for(var j:jobs){var checkpoint=json(j.get("checkpoint_json"));if(!checkpoint.isObject())throw new ApiException(409,"RETENTION_SOURCE_INVALID");((ObjectNode)checkpoint).remove("artifactKeys");db.update("UPDATE mp_background_job SET checkpoint_json=? WHERE id=?",string(checkpoint),n(j,"id"));}
            if(metadata){db.update("DELETE FROM mp_idempotency_record WHERE resource_type IN (?,?) AND resource_id=?",type,target,id);if(admin){db.update("DELETE FROM mp_sensitive_audit WHERE target_type='ADMIN_EXPORT' AND target_public_id=?",s(export,"public_id"));db.update("DELETE FROM mp_admin_export_student WHERE export_id=?",id);}for(var j:jobs)db.update("DELETE FROM mp_background_job WHERE id=?",n(j,"id"));count+=db.update("DELETE FROM "+table+" WHERE id=?",id);}
            else if(!keys.isEmpty()||"READY".equals(s(export,"status"))){db.update("UPDATE "+table+" SET object_key=NULL,file_sha256=NULL,file_size_bytes=NULL,status=IF(status='READY','EXPIRED',status),row_version=row_version+1 WHERE id=?",id);count++;}
        }return count;
    }
    private static String exportCondition(boolean metadata,boolean admin){String type=admin?"ADMIN_EXPORT":"STUDENT_EXPORT",target=admin?"ADMIN_EXPORT":"STUDENT_DATA_EXPORT";String jobs="SELECT 1 FROM mp_background_job j WHERE j.job_type='"+type+"' AND j.target_type='"+target+"' AND j.target_id=x.id";String ready=metadata?"x.status IN ('EXPIRED','FAILED','REVOKED') AND COALESCE(x.completed_at,x.requested_at)<?":"((x.status='READY' AND x.expires_at<=?) OR (x.status IN ('EXPIRED','FAILED','REVOKED') AND (x.object_key IS NOT NULL OR EXISTS("+jobs+" AND JSON_LENGTH(JSON_EXTRACT(j.checkpoint_json,'$.artifactKeys'))>0))))";return ready+" AND NOT EXISTS("+jobs+" AND j.status IN ('PENDING','RUNNING','RETRY_WAIT'))";}
    private long unconfirmed(Instant cutoff,Instant asOf,int batch){long count=0;var candidates=db.queryForList("SELECT r.id,r.student_id FROM mp_account_deletion_request r WHERE r.status IN ('REQUESTED','CANCELLED') AND r.student_id IS NOT NULL AND r.confirmed_at IS NULL AND r.requested_at<=? AND NOT EXISTS(SELECT 1 FROM mp_student_account a WHERE a.id=r.student_id AND a.status IN ('DELETION_PENDING','DELETED')) AND NOT EXISTS(SELECT 1 FROM mp_background_job j WHERE j.job_type='ACCOUNT_DELETE' AND j.target_type='ACCOUNT_DELETION_REQUEST' AND j.target_id=r.id) ORDER BY r.id LIMIT ?",Timestamp.from(cutoff),batch);var allowed=students(candidates.stream().map(r->nullable(r,"student_id")).toList());for(var row:candidates){Long owner=nullable(row,"student_id");if(owner!=null&&!allowed.get(owner))continue;var locked=db.queryForList("SELECT id FROM mp_account_deletion_request WHERE id=? AND status IN ('REQUESTED','CANCELLED') AND student_id IS NOT NULL AND confirmed_at IS NULL AND requested_at<=? FOR UPDATE SKIP LOCKED",n(row,"id"),Timestamp.from(cutoff));if(locked.isEmpty())continue;if(db.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE job_type='ACCOUNT_DELETE' AND target_type='ACCOUNT_DELETION_REQUEST' AND target_id=?",Integer.class,n(row,"id"))>0)continue;count+=db.update("UPDATE mp_account_deletion_request SET status='CANCELLED',current_stage='CANCELLED',student_id=NULL,receipt_expires_at=LEAST(receipt_expires_at,?),row_version=row_version+1 WHERE id=?",Timestamp.from(asOf),n(row,"id"));}return count;}
    private long receipts(Instant asOf,int batch){var rows=db.queryForList("SELECT id FROM mp_account_deletion_request WHERE student_id IS NULL AND status IN ('COMPLETED','CANCELLED') AND receipt_expires_at<=? AND NOT EXISTS(SELECT 1 FROM mp_background_job j WHERE j.job_type='ACCOUNT_DELETE' AND j.target_type='ACCOUNT_DELETION_REQUEST' AND j.target_id=mp_account_deletion_request.id) ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED",Timestamp.from(asOf),batch);long count=0;for(var r:rows)count+=db.update("DELETE FROM mp_account_deletion_request WHERE id=? AND student_id IS NULL",n(r,"id"));return count;}
}
