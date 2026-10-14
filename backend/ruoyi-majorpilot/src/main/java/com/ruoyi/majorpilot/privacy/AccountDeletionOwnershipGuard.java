package com.ruoyi.majorpilot.privacy;

import com.ruoyi.majorpilot.shared.ApiException;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Read-only preflight, before the FILES phase removes anything. Never widens a deletion scope.
 * All publishers must share the caller's Student lock. Later phases use the already validated,
 * fixed scope: polymorphic targets can legitimately disappear while that scope is being removed. */
@Service @Profile({"local","pilot"})
public class AccountDeletionOwnershipGuard {
    record Edge(String child,String column,String parent,String parentColumn) {}
    private static final Edge MEMBERSHIP=new Edge("mp_admin_export_student","export_id","mp_admin_export","id");
    private static final Map<String,String> OWNERS=owners();
    private static final Set<Edge> EDGES=edges();
    private static final Set<String> GLOBAL=Set.of("mp_major","mp_task_version","sys_user","mp_admin_export");
    private final JdbcTemplate db;
    public AccountDeletionOwnershipGuard(JdbcTemplate db){this.db=db;}

    public void validate(long studentId){
        if(studentId<=0||!TransactionSynchronizationManager.isActualTransactionActive())throw invalid();
        try{
            var account=db.queryForList("SELECT status FROM mp_student_account WHERE id=? FOR UPDATE",studentId);
            if(account.size()!=1||!"DELETION_PENDING".equals(account.getFirst().get("status")))throw invalid();
            validateSchema(db.queryForList("SELECT TABLE_NAME AS child_table,COLUMN_NAME AS child_column,REFERENCED_TABLE_NAME AS parent_table,REFERENCED_COLUMN_NAME AS parent_column,CONSTRAINT_NAME AS constraint_name,ORDINAL_POSITION AS ordinal_position,(REFERENCED_TABLE_SCHEMA=TABLE_SCHEMA) AS same_schema FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"));
            for(var edge:EDGES){
                if(edge.equals(MEMBERSHIP)||GLOBAL.contains(edge.parent()))continue;
                reject("SELECT 1 FROM ("+projection(edge.child())+") c JOIN ("+projection(edge.parent())+") p ON c."+edge.column()+"=p."+edge.parentColumn()+" WHERE (c.deletion_owner=? OR p.deletion_owner=?) AND NOT(c.deletion_owner <=> p.deletion_owner) LIMIT 1",studentId,studentId);
            }
            polymorphic(studentId);
            cycles(studentId,"mp_experience_run","origin_run_id");
            cycles(studentId,"mp_decision_profile","supersedes_profile_id");
        }catch(DataAccessException unavailable){throw invalid();}
    }

    /** Exact schema registry: an unknown incoming edge is rejected even when its table is empty. */
    static void validateSchema(List<Map<String,Object>> metadata){
        var actual=new HashSet<Edge>();var constraints=new HashSet<String>();
        for(var row:metadata){
            String child=string(row,"child_table"),parent=string(row,"parent_table");
            if(!OWNERS.containsKey(child)&&!OWNERS.containsKey(parent)&&!child.equals("mp_admin_export")&&!parent.equals("mp_admin_export"))continue;
            Edge edge=new Edge(child,string(row,"child_column"),parent,string(row,"parent_column"));
            if(!EDGES.contains(edge)||number(row,"ordinal_position")!=1||number(row,"same_schema")!=1||!constraints.add(child+":"+string(row,"constraint_name"))||!actual.add(edge))throw invalid();
        }
        if(!actual.equals(EDGES))throw invalid();
    }
    static Set<Edge> registeredEdges(){return EDGES;}
    static Set<String> registeredTables(){return OWNERS.keySet();}
    static String projection(String table){String query=OWNERS.get(table);if(query==null)throw invalid();return query;}
    private void reject(String sql,Object... parameters){if(!db.queryForList(sql,parameters).isEmpty())throw invalid();}

    private void polymorphic(long student){
        var jobs=Map.of("EXPERIENCE_RUN","mp_experience_run","REPORT_VERSION","mp_report_version","STUDENT_DATA_EXPORT","mp_student_data_export","ACCOUNT_DELETION_REQUEST","mp_account_deletion_request");
        for(var target:jobs.entrySet())link(student,"mp_background_job","target_type","target_id",target.getKey(),target.getValue(),"id");
        reject("SELECT 1 FROM mp_background_job WHERE owner_student_id=? AND (target_type NOT IN ('EXPERIENCE_RUN','REPORT_VERSION','STUDENT_DATA_EXPORT','ACCOUNT_DELETION_REQUEST') OR NOT ((job_type='EVIDENCE_BUILD' AND target_type='EXPERIENCE_RUN') OR (job_type IN ('EVIDENCE_REBUILD','REPORT_GENERATE','COMPARISON_GENERATE','METHOD_REPORT') AND target_type='REPORT_VERSION') OR (job_type='STUDENT_EXPORT' AND target_type='STUDENT_DATA_EXPORT') OR (job_type='ACCOUNT_DELETE' AND target_type='ACCOUNT_DELETION_REQUEST'))) LIMIT 1",student);
        // An Operator export legitimately has many members. Only its explicit Operator identity
        // may own its job; membership never turns a shared export into a single Student's tree.
        reject("SELECT 1 FROM mp_background_job j JOIN mp_admin_export_student m ON j.target_id=m.export_id LEFT JOIN mp_admin_export e ON e.id=m.export_id WHERE m.student_id=? AND j.target_type='ADMIN_EXPORT' AND (j.job_type<>'ADMIN_EXPORT' OR j.owner_student_id IS NOT NULL OR NOT(j.owner_operator_id <=> e.operator_id)) LIMIT 1",student);

        var sources=Map.of("STEP_RESPONSE_REVISION","mp_step_response_revision","EXECUTION_RECORD","mp_execution_record","REFLECTION","mp_reflection","HINT_REQUEST","mp_hint_request");
        // Evidence keeps historical provenance, not a deletion FK: a legitimately retired
        // source may no longer exist. If it still resolves, however, cross-owner provenance
        // in either direction is never used to expand or approve the deletion scope.
        for(var source:sources.entrySet())link(student,"mp_evidence_item","source_type","source_id",source.getKey(),source.getValue(),"id",true);
        reject("SELECT 1 FROM ("+projection("mp_evidence_item")+") e WHERE e.deletion_owner=? AND e.source_type NOT IN ('STEP_RESPONSE_REVISION','EXECUTION_RECORD','REFLECTION','HINT_REQUEST') LIMIT 1",student);

        // Historic audit rows can lack owner_student_id. Derive only from a registered, exact
        // target kind; a missing old target is not guessed or reassigned to this Student.
        var audits=Map.of("STUDENT","mp_student_account","EXPERIENCE_RUN","mp_experience_run","REPORT","mp_report","REPORT_VERSION","mp_report_version");
        for(var audit:audits.entrySet())link(student,"mp_sensitive_audit","target_type","target_public_id",audit.getKey(),audit.getValue(),"public_id");
        reject("SELECT 1 FROM mp_sensitive_audit WHERE owner_student_id=? AND target_type NOT IN ('STUDENT','EXPERIENCE_RUN','REPORT','REPORT_VERSION') LIMIT 1",student);

        // Currently only Operator exports use resource pointers. A future Student pointer is
        // not accepted until it has an explicit ownership rule and deletion handling.
        reject("SELECT 1 FROM ("+projection("mp_idempotency_record")+") i WHERE i.deletion_owner=? AND (i.resource_type IS NOT NULL OR i.resource_id IS NOT NULL) LIMIT 1",student);
        reject("SELECT 1 FROM ("+projection("mp_idempotency_record")+") i JOIN mp_admin_export_student m ON m.export_id=i.resource_id WHERE m.student_id=? AND i.resource_type='ADMIN_EXPORT' AND i.deletion_owner IS NOT NULL LIMIT 1",student);
    }
    private void link(long student,String child,String typeColumn,String valueColumn,String kind,String parent,String parentKey){
        link(student,child,typeColumn,valueColumn,kind,parent,parentKey,false);
    }
    private void link(long student,String child,String typeColumn,String valueColumn,String kind,String parent,String parentKey,boolean historical){
        reject("SELECT 1 FROM ("+projection(child)+") c LEFT JOIN ("+projection(parent)+") p ON c."+valueColumn+"=p."+parentKey+" WHERE c."+typeColumn+"=?"+(historical?" AND p."+parentKey+" IS NOT NULL":"")+" AND (c.deletion_owner=? OR p.deletion_owner=?) AND NOT(c.deletion_owner <=> p.deletion_owner) LIMIT 1",kind,student,student);
    }
    private void cycles(long student,String table,String parent){
        var rows=db.queryForList("SELECT id,"+parent+" AS parent_id FROM ("+projection(table)+") owned WHERE deletion_owner=?",student);
        var edges=new HashMap<Long,Long>();for(var row:rows){long id=number(row,"id");Long previous=row.get("parent_id")==null?null:number(row,"parent_id");if(edges.put(id,previous)!=null)throw invalid();}assertAcyclic(edges);
    }
    /** Iterative and linear: a long legitimate recovery history must not overflow the JVM stack. */
    static void assertAcyclic(Map<Long,Long> parents){
        var done=new HashSet<Long>();
        for(Long start:parents.keySet()){
            var path=new HashSet<Long>();Long at=start;
            while(at!=null&&!done.contains(at)){
                if(!parents.containsKey(at)||!path.add(at))throw invalid();
                at=parents.get(at);
            }
            done.addAll(path);
        }
    }
    private static Map<String,String> owners(){
        var out=new LinkedHashMap<String,String>();
        out.put("mp_student_account","SELECT t.*,t.id AS deletion_owner FROM mp_student_account t");
        // Only the occupied invitation slot survives deletion; usage rows are erased.
        direct(out,"mp_pilot_account","student_id");direct(out,"mp_pilot_report_usage","student_id");
        for(String name:List.of("mp_student_session","mp_email_token","mp_security_event","mp_experience_run","mp_evidence_snapshot","mp_report","mp_student_feedback","mp_ai_call","mp_student_data_export","mp_account_deletion_request"))direct(out,name,"student_id");
        direct(out,"mp_intake_session","claimed_student_id");direct(out,"mp_background_job","owner_student_id");direct(out,"mp_admin_export_student","student_id");
        for(String name:List.of("mp_consent_record","mp_decision_profile","mp_product_event"))out.put(name,"SELECT t.*,COALESCE(t.student_id,i.claimed_student_id) AS deletion_owner FROM "+name+" t LEFT JOIN mp_intake_session i ON i.id=t.intake_session_id");
        out.put("mp_idempotency_record","SELECT t.*,COALESCE(t.owner_student_id,i.claimed_student_id) AS deletion_owner FROM mp_idempotency_record t LEFT JOIN mp_intake_session i ON i.id=t.owner_intake_session_id");
        out.put("mp_recommendation","SELECT t.*,COALESCE(t.student_id,p.student_id,i.claimed_student_id) AS deletion_owner FROM mp_recommendation t LEFT JOIN mp_decision_profile p ON p.id=t.decision_profile_id LEFT JOIN mp_intake_session i ON i.id=p.intake_session_id");
        direct(out,"mp_recommendation_decision","student_id");direct(out,"mp_run_product_adoption","student_id");
        via(out,"mp_decision_answer","decision_profile_id","mp_decision_profile");via(out,"mp_recommendation_reason","recommendation_id","mp_recommendation");
        for(String name:List.of("mp_step_state","mp_execution_record","mp_hint_request","mp_reflection","mp_run_closure_request"))via(out,name,"experience_run_id","mp_experience_run");
        via(out,"mp_step_response_revision","step_state_id","mp_step_state");via(out,"mp_step_completion","step_state_id","mp_step_state");
        via(out,"mp_response_execution","response_revision_id","mp_step_response_revision");via(out,"mp_reflection_answer","reflection_id","mp_reflection");
        via(out,"mp_evidence_item","evidence_snapshot_id","mp_evidence_snapshot");via(out,"mp_report_version","report_id","mp_report");
        via(out,"mp_report_claim","report_version_id","mp_report_version");via(out,"mp_report_claim_evidence","report_claim_id","mp_report_claim");
        via(out,"mp_comparison_source","comparison_report_version_id","mp_report_version");
        out.put("mp_sensitive_audit","SELECT t.*,COALESCE(t.owner_student_id,s.id,r.student_id,p.student_id,vp.student_id) AS deletion_owner FROM mp_sensitive_audit t LEFT JOIN mp_student_account s ON t.target_type='STUDENT' AND s.public_id=t.target_public_id LEFT JOIN mp_experience_run r ON t.target_type='EXPERIENCE_RUN' AND r.public_id=t.target_public_id LEFT JOIN mp_report p ON t.target_type='REPORT' AND p.public_id=t.target_public_id LEFT JOIN mp_report_version v ON t.target_type='REPORT_VERSION' AND v.public_id=t.target_public_id LEFT JOIN mp_report vp ON vp.id=v.report_id");
        return Collections.unmodifiableMap(out);
    }
    private static void direct(Map<String,String> map,String table,String owner){map.put(table,"SELECT t.*,t."+owner+" AS deletion_owner FROM "+table+" t");}
    private static void via(Map<String,String> map,String table,String column,String parent){map.put(table,"SELECT t.*,p.deletion_owner FROM "+table+" t LEFT JOIN ("+map.get(parent)+") p ON p.id=t."+column);}
    private static Set<Edge> edges(){
        var all=new LinkedHashSet<Edge>();
        edge(all,"mp_pilot_account","student_id","mp_student_account");
        all.add(new Edge("mp_pilot_report_usage","student_id","mp_pilot_account","student_id"));
        for(String name:List.of("mp_student_session","mp_email_token","mp_security_event","mp_experience_run","mp_evidence_snapshot","mp_report","mp_student_feedback","mp_ai_call","mp_student_data_export","mp_account_deletion_request","mp_recommendation_decision"))edge(all,name,"student_id","mp_student_account");
        edge(all,"mp_intake_session","claimed_student_id","mp_student_account");edge(all,"mp_background_job","owner_student_id","mp_student_account");edge(all,"mp_sensitive_audit","owner_student_id","mp_student_account");
        for(String name:List.of("mp_consent_record","mp_decision_profile","mp_product_event")){edge(all,name,"student_id","mp_student_account");edge(all,name,"intake_session_id","mp_intake_session");}
        edge(all,"mp_idempotency_record","owner_student_id","mp_student_account");edge(all,"mp_idempotency_record","owner_intake_session_id","mp_intake_session");
        edge(all,"mp_decision_profile","supersedes_profile_id","mp_decision_profile");edge(all,"mp_decision_answer","decision_profile_id","mp_decision_profile");
        edge(all,"mp_recommendation","student_id","mp_student_account");edge(all,"mp_recommendation","decision_profile_id","mp_decision_profile");edge(all,"mp_recommendation","source_run_id","mp_experience_run");
        edge(all,"mp_recommendation_reason","recommendation_id","mp_recommendation");edge(all,"mp_recommendation_decision","recommendation_id","mp_recommendation");
        edge(all,"mp_experience_run","major_id","mp_major");edge(all,"mp_experience_run","task_version_id","mp_task_version");edge(all,"mp_experience_run","source_recommendation_id","mp_recommendation");edge(all,"mp_experience_run","source_decision_id","mp_recommendation_decision");edge(all,"mp_experience_run","decision_profile_id","mp_decision_profile");edge(all,"mp_experience_run","origin_run_id","mp_experience_run");
        for(String name:List.of("mp_step_state","mp_execution_record","mp_hint_request","mp_reflection","mp_run_closure_request"))edge(all,name,"experience_run_id","mp_experience_run");
        edge(all,"mp_step_response_revision","step_state_id","mp_step_state");edge(all,"mp_step_completion","step_state_id","mp_step_state");edge(all,"mp_response_execution","response_revision_id","mp_step_response_revision");edge(all,"mp_response_execution","execution_record_id","mp_execution_record");edge(all,"mp_reflection_answer","reflection_id","mp_reflection");
        edge(all,"mp_evidence_snapshot","experience_run_id","mp_experience_run");edge(all,"mp_evidence_snapshot","decision_profile_id","mp_decision_profile");edge(all,"mp_evidence_snapshot","task_version_id","mp_task_version");edge(all,"mp_evidence_snapshot","origin_job_id","mp_background_job");edge(all,"mp_evidence_item","evidence_snapshot_id","mp_evidence_snapshot");
        edge(all,"mp_report","experience_run_id","mp_experience_run");edge(all,"mp_report","major_id","mp_major");edge(all,"mp_report","next_recommendation_id","mp_recommendation");edge(all,"mp_report","current_version_id","mp_report_version");edge(all,"mp_report","generation_target_version_id","mp_report_version");
        edge(all,"mp_report_version","report_id","mp_report");edge(all,"mp_report_version","next_recommendation_id","mp_recommendation");edge(all,"mp_report_claim","report_version_id","mp_report_version");edge(all,"mp_report_claim_evidence","report_claim_id","mp_report_claim");edge(all,"mp_report_claim_evidence","evidence_item_id","mp_evidence_item");
        edge(all,"mp_comparison_source","comparison_report_version_id","mp_report_version");edge(all,"mp_comparison_source","source_experience_report_version_id","mp_report_version");edge(all,"mp_comparison_source","major_id","mp_major");
        for(String table:List.of("mp_student_feedback","mp_ai_call")){edge(all,table,"experience_run_id","mp_experience_run");edge(all,table,"report_version_id","mp_report_version");}
        edge(all,"mp_student_feedback","report_id","mp_report");edge(all,"mp_student_feedback","major_id","mp_major");edge(all,"mp_student_feedback","task_version_id","mp_task_version");
        for(String[] pair:List.of(new String[]{"recommendation_id","mp_recommendation"},new String[]{"experience_run_id","mp_experience_run"},new String[]{"task_version_id","mp_task_version"},new String[]{"report_id","mp_report"},new String[]{"report_version_id","mp_report_version"},new String[]{"feedback_id","mp_student_feedback"}))edge(all,"mp_product_event",pair[0],pair[1]);
        edge(all,"mp_admin_export_student","student_id","mp_student_account");all.add(MEMBERSHIP);
        all.add(new Edge("mp_background_job","owner_operator_id","sys_user","user_id"));
        all.add(new Edge("mp_admin_export","operator_id","sys_user","user_id"));
        edge(all,"mp_run_product_adoption","student_id","mp_student_account");
        edge(all,"mp_run_product_adoption","experience_run_id","mp_experience_run");
        edge(all,"mp_run_product_adoption","decision_profile_id","mp_decision_profile");
        edge(all,"mp_run_product_adoption","task_version_id","mp_task_version");
        all.add(new Edge("mp_run_product_adoption","authorized_by_operator_id","sys_user","user_id"));
        return Collections.unmodifiableSet(all);
    }
    private static void edge(Set<Edge> edges,String table,String column,String parent){edges.add(new Edge(table,column,parent,"id"));}
    private static String string(Map<String,Object> row,String field){Object value=row.get(field);if(!(value instanceof String text))throw invalid();return text;}
    private static long number(Map<String,Object> row,String field){Object value=row.get(field);if(value instanceof Boolean flag)return flag?1:0;if(!(value instanceof Number number))throw invalid();return number.longValue();}
    static ApiException invalid(){return new ApiException(503,"DELETION_SOURCE_INVALID");}
}
