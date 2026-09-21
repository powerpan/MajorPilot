package com.ruoyi.majorpilot.privacy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.shared.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component @Profile("local")
public class PrivacyStore {
    final JdbcTemplate db;final TransactionTemplate tx;final ObjectMapper mapper;
    public PrivacyStore(JdbcTemplate db,TransactionTemplate tx,ObjectMapper mapper){this.db=db;this.tx=tx;this.mapper=mapper;}
    Map<String,Object> account(long id,boolean deleting){
        var rows=db.queryForList("SELECT * FROM mp_student_account WHERE id=? FOR UPDATE",id);
        if(rows.isEmpty())throw new ApiException(401,"AUTH_REQUIRED");
        var row=rows.getFirst();if(deleting?!"DELETION_PENDING".equals(row.get("status")):!Set.of("ACTIVE","PENDING_VERIFICATION").contains(row.get("status")))throw new ApiException(403,"ACCOUNT_LOCKED");return row;
    }
    Map<String,Object> export(long student,String publicId){
        id(publicId);var rows=db.queryForList("SELECT * FROM mp_student_data_export WHERE public_id=? AND student_id=?",publicId,student);
        if(rows.isEmpty())throw missing();return rows.getFirst();
    }
    Map<String,Object> deletion(long student,String publicId){
        id(publicId);var rows=db.queryForList("SELECT * FROM mp_account_deletion_request WHERE public_id=? AND student_id=?",publicId,student);
        if(rows.isEmpty())throw missing();return rows.getFirst();
    }
    void enqueue(String type,String business,long student,String target,long id){
        db.update("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_student_id,target_type,target_id,target_version,checkpoint_json) VALUES(?,?,?,?,?,?,1,?)",PublicIds.next(),type,business,student,target,id,"{\"phase\":\"PREPARED\",\"artifactKeys\":[]}");
    }
    String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception invalid){throw new IllegalStateException("PRIVACY_DATA_INVALID");}}
    JsonNode node(Object value){try{return value==null?mapper.createObjectNode():mapper.readTree(value.toString());}catch(Exception invalid){throw new IllegalStateException("PRIVACY_DATA_INVALID");}}
    static PrivacyDtos.ExportStatus exportStatus(Map<String,Object> row,Instant now){
        String state=s(row,"status");Instant expires=t(row,"expires_at");if(state.equals("READY")&&expires!=null&&!expires.isAfter(now))state="EXPIRED";
        return new PrivacyDtos.ExportStatus(s(row,"public_id"),s(row,"scope"),state,s(row,"format"),t(row,"requested_at"),t(row,"completed_at"),expires,s(row,"failure_code"),row.get("file_size_bytes")==null?null:n(row,"file_size_bytes"));
    }
    static PrivacyDtos.DeletionStatus deletionStatus(Map<String,Object> row){return new PrivacyDtos.DeletionStatus(s(row,"public_id"),s(row,"receipt_id"),s(row,"status"),t(row,"requested_at"),t(row,"confirmed_at"),t(row,"scheduled_for"),t(row,"completed_at"),t(row,"receipt_expires_at"));}
    static long n(Map<String,Object> r,String key){return ((Number)r.get(key)).longValue();}
    static String s(Map<String,Object> r,String key){return r.get(key)==null?null:r.get(key).toString();}
    static Instant t(Map<String,Object> r,String key){return r.get(key)==null?null:DbTimes.instant(r.get(key));}
    static Timestamp stamp(Instant time){return time==null?null:Timestamp.from(time);}
    static void id(String id){if(id==null||!id.matches("[0-7][0-9A-HJKMNP-TV-Z]{25}"))throw missing();}
    static ApiException missing(){return new ApiException(404,"RESOURCE_NOT_FOUND");}
}
