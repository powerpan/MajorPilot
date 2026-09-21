package com.ruoyi.majorpilot.operations;

import com.fasterxml.jackson.core.type.TypeReference;
import com.ruoyi.majorpilot.analytics.metrics.MetricsModels.*;
import com.ruoyi.majorpilot.privacy.PrivateObjectStore;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.security.RateLimits;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static com.ruoyi.majorpilot.operations.OperationsService.*;
import static com.ruoyi.majorpilot.operations.OperationsDtos.*;

@Service @Profile("local")
public class AdminExportService {
    public record Material(byte[] bytes,List<Long> students,long rows){}
    private final OperationsService ops;private final OperationsMetrics metrics;private final IdempotencyService idem;private final RateLimits limits;private final PrivateObjectStore objects;private final TransactionTemplate read;
    public AdminExportService(OperationsService ops,OperationsMetrics metrics,IdempotencyService idem,RateLimits limits,PrivateObjectStore objects){this.ops=ops;this.metrics=metrics;this.idem=idem;this.limits=limits;this.objects=objects;read=new TransactionTemplate(ops.tx.getTransactionManager());read.setReadOnly(true);read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);}
    public ExportStatus create(long operator,String key,ExportCreate input,String request){
        ops.audit.operator(operator,true,false);if(input==null||input.purpose()==null||input.purpose().isBlank()||input.purpose().codePointCount(0,input.purpose().length())<10||input.purpose().codePointCount(0,input.purpose().length())>500)throw OperationsQuery.invalid();
        var owner=new IdempotencyService.Owner(null,null,"operator:"+operator);var replay=idem.replay(owner,"POST","/api/admin/v1/majorpilot/exports",key,input,ExportStatus.class);if(replay.isPresent())return replay.get();
        var fields=OperationsCsv.fields(input.dataset(),input.fields());var filters=OperationsQuery.filters(input.filters(),Instant.now());if(!"REPORTS".equals(input.dataset())&&filters.reportType()!=null)throw OperationsQuery.invalid();limits.require("admin-export-create",Long.toString(operator),5,Duration.ofMinutes(1));
        return idem.execute(owner,"POST","/api/admin/v1/majorpilot/exports",key,input,ExportStatus.class,()->{
            ops.audit.operator(operator,true,true);String publicId=PublicIds.next();ops.db.update("INSERT INTO mp_admin_export(public_id,operator_id,dataset,schema_version,filters_json,fields_json,purpose,status) VALUES(?,?,?,'admin-csv-v1',?,?,?,'REQUESTED')",publicId,operator,input.dataset(),string(filters),string(fields),input.purpose());
            long id=ops.db.queryForObject("SELECT id FROM mp_admin_export WHERE public_id=?",Long.class,publicId);
            ops.db.update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_operator_id,target_type,target_id,checkpoint_json) VALUES(?,'ADMIN_EXPORT',?,?,'ADMIN_EXPORT',?,?)",PublicIds.next(),"admin-export:"+publicId,operator,id,string(Map.of("exportId",publicId,"schemaVersion","admin-csv-v1")));
            ops.db.update("UPDATE mp_idempotency_record SET resource_type='ADMIN_EXPORT',resource_id=? WHERE scope_hash=? AND key_hash=?",id,Secrets.hash(owner.subject()+"\0POST\0/api/admin/v1/majorpilot/exports"),Secrets.hash(key));
            ops.audit.write(operator,null,"ADMIN_EXPORT_REQUESTED","ADMIN_EXPORT",publicId,"PRODUCT_ANALYSIS",input.purpose(),Map.of(),Map.of("dataset",input.dataset(),"schemaVersion","admin-csv-v1"),request);
            return view(owned(operator,publicId));
        }).data();
    }
    public ExportStatus status(long operator,String id){ops.audit.operator(operator,true,false);return view(owned(operator,id));}
    Map<String,Object> owned(long operator,String id){var rows=ops.db.queryForList("SELECT * FROM mp_admin_export WHERE public_id=? AND operator_id=?",id,operator);if(rows.isEmpty())throw missing();return rows.getFirst();}
    ExportStatus view(Map<String,Object> r){String status=s(r,"status");if("READY".equals(status)&&time(r,"expires_at")!=null&&!time(r,"expires_at").isAfter(Instant.now()))status="EXPIRED";return new ExportStatus(s(r,"public_id"),s(r,"dataset"),s(r,"schema_version"),filters(r),fields(r),OperationsCsv.anchor(s(r,"dataset")),status,nullable(r,"row_count"),nullable(r,"file_size_bytes"),time(r,"requested_at"),time(r,"completed_at"),time(r,"expires_at"),s(r,"failure_code"),n(r,"row_version"),"REPORTS".equals(s(r,"dataset"))?OperationsQuery.reportScope(filters(r)):List.of("时间与范围按timeAnchor和filters固定；不含TEST/BOT或删除中主体。"));}
    OperationsDtos.Filters filters(Map<String,Object> r){try{return ops.mapper.treeToValue(ops.json(r.get("filters_json")),OperationsDtos.Filters.class);}catch(Exception bad){throw new ApiException(409,"EXPORT_SOURCE_INVALID");}}
    List<String> fields(Map<String,Object> r){try{return ops.mapper.convertValue(ops.json(r.get("fields_json")),new TypeReference<List<String>>(){});}catch(Exception bad){throw new ApiException(409,"EXPORT_SOURCE_INVALID");}}
    String string(Object value){try{return ops.mapper.writeValueAsString(value);}catch(Exception bad){throw new ApiException(422,"VALIDATION_ERROR");}}
    public byte[] download(long operator,String id,String request){
        var known=owned(operator,id);List<Long> members=members(n(known,"id"));
        return ops.tx.execute(t->{lockMembers(members);ops.audit.operator(operator,true,true);var r=ops.db.queryForMap("SELECT * FROM mp_admin_export WHERE id=? AND operator_id=? FOR UPDATE",n(known,"id"),operator);if(!members.equals(members(n(r,"id"))))throw new ApiException(409,"EXPORT_SOURCE_INVALID");if(!"READY".equals(s(r,"status"))||time(r,"expires_at")==null||!time(r,"expires_at").isAfter(Instant.now()))throw new ApiException(409,"EXPORT_NOT_AVAILABLE");var bytes=objects.read(s(r,"object_key"));if(bytes.length!=n(r,"file_size_bytes")||!hash(bytes).equals(s(r,"file_sha256")))throw new ApiException(409,"EXPORT_SOURCE_INVALID");ops.audit.write(operator,null,"ADMIN_EXPORT_DOWNLOADED","ADMIN_EXPORT",id,"PRODUCT_ANALYSIS","Authorized private CSV download",Map.of(),Map.of("rowCount",n(r,"row_count")),request);return bytes;});
    }
    List<Long> members(long export){return ops.db.queryForList("SELECT student_id FROM mp_admin_export_student WHERE export_id=? ORDER BY student_id",Long.class,export);}
    void lockMembers(List<Long> members){for(long student:members){var rows=ops.db.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",student);if(rows.isEmpty()||Set.of("DELETION_PENDING","DELETED").contains(s(rows.getFirst(),"status")))throw new ApiException(409,"EXPORT_SUBJECT_UNAVAILABLE");}}
    public Material material(Map<String,Object> export){return read.execute(t->{var f=filters(export);var q=new OperationsQuery(1,100,null,"asc",f,null,null,null,null);List<Map<String,Object>> rows=new ArrayList<>();Set<Long> members=new TreeSet<>();String dataset=s(export,"dataset");
        if(dataset.equals("METRICS")){var snapshot=metrics.snapshot(f.asOf());var overview=metrics.compute(snapshot,f);for(var student:snapshot.students())if(student.analyticsExclusionCode()==null&&!Set.of("DELETION_PENDING","DELETED").contains(student.status()))members.add(student.id());addMetrics(rows,"ALL",overview.metrics());for(var major:overview.byMajor())addMetrics(rows,major.majorCode(),major.metrics());}
        else {OperationsService.Where where;String select,from;if(dataset.equals("STUDENTS")){where=ops.studentWhere(q,true);select=OperationsService.STUDENT_SELECT.replace("p.student_id=a.id)","p.student_id=a.id AND p.submitted_at<=cutoff.as_of)").replace("r.started_at IS NOT NULL","r.started_at<=cutoff.as_of").replace("r.status='CLOSED'","r.closed_at<=cutoff.as_of");from="FROM mp_student_account a CROSS JOIN (SELECT ? AS as_of) cutoff";}else if(dataset.equals("EXPERIENCE_RUNS")){where=ops.runWhere(q,true);select=OperationsService.RUN_SELECT;from=OperationsService.RUN_FROM;}else if(dataset.equals("REPORTS")){where=ops.reportWhere(q,true);select=OperationsService.REPORT_SELECT;from=OperationsService.REPORT_FROM;}else throw OperationsQuery.invalid();
            var queryArgs=new ArrayList<Object>();if(dataset.equals("STUDENTS"))queryArgs.add(Timestamp.from(f.asOf()));queryArgs.addAll(where.args);for(var r:ops.db.queryForList("SELECT "+select+" "+from+where.sql+" ORDER BY a.id LIMIT 10001",queryArgs.toArray())){long student=dataset.equals("STUDENTS")?n(r,"id"):n(r,"student_id");members.add(student);Object view=dataset.equals("STUDENTS")?ops.student(r):dataset.equals("EXPERIENCE_RUNS")?ops.run(r):ops.report(r);rows.add(ops.mapper.convertValue(view,new TypeReference<Map<String,Object>>(){}));}}
        if(rows.size()>10000)throw new ApiException(422,"EXPORT_ROW_LIMIT_EXCEEDED");return new Material(OperationsCsv.render(OperationsCsv.fields(dataset,fields(export)),rows),List.copyOf(members),rows.size());
    });}
    private static void addMetrics(List<Map<String,Object>> rows,String major,Core core){addMetric(rows,major,"firstExperienceCompletion",core.firstExperienceCompletion());addMetric(rows,major,"reportInsight",core.reportInsight());addMetric(rows,major,"secondExperienceStart",core.secondExperienceStart());}
    private static void addMetric(List<Map<String,Object>> rows,String major,String key,Kpi k){var row=new LinkedHashMap<String,Object>();row.put("metric",key);row.put("majorCode",major);row.put("numerator",k.numerator());row.put("denominator",k.denominator());row.put("rate",k.rate());row.put("cohortCount",k.cohortCount());row.put("immatureCount",k.immatureCount());row.put("anchor",k.anchor());row.put("windowDays",k.windowDays());rows.add(row);}
    static String hash(byte[] bytes){try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception bad){throw new IllegalStateException("SHA unavailable");}}
}
