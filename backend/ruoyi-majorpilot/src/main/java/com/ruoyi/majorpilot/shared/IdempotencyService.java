package com.ruoyi.majorpilot.shared;
import com.fasterxml.jackson.databind.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
@Service @Profile("local")
public class IdempotencyService {
    public record Owner(Long studentId,Long intakeId,String subject) {}
    public record Result<T>(T data,boolean replayed) {}
    private final JdbcTemplate jdbc;private final TransactionTemplate tx;private final Secrets secrets;private final ObjectMapper mapper;
    public IdempotencyService(JdbcTemplate jdbc,TransactionTemplate tx,Secrets secrets,ObjectMapper mapper) { this.jdbc=jdbc;this.tx=tx;this.secrets=secrets;this.mapper=mapper.copy().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true); }
    public <T> Result<T> execute(Owner owner,String method,String resourcePath,String key,Object request,Class<T> responseType,Supplier<T> action) {
        if(key==null||!key.matches("[A-Za-z0-9_-]{16,128}"))throw new ApiException(422,"IDEMPOTENCY_KEY_REQUIRED");
        String scope=Secrets.hash(owner.subject()+"\0"+method+"\0"+resourcePath),keyHash=Secrets.hash(key),fingerprint=secrets.hmac("idempotency",json(request));
        return tx.execute(status->{
            // Connection-bound MySQL advisory lock prevents concurrent execution;
            // unique(scope,key) remains the durable business constraint.
            String lock="mp-idem-"+Secrets.hash(scope+keyHash).substring(0,48);
            if(!Integer.valueOf(1).equals(jdbc.queryForObject("SELECT GET_LOCK(?,0)",Integer.class,lock)))throw new ApiException(409,"REQUEST_IN_PROGRESS");
            try {
                var rows=jdbc.queryForList("SELECT request_hmac,status,safe_response_json,expires_at FROM mp_idempotency_record WHERE scope_hash=? AND key_hash=? FOR UPDATE",scope,keyHash);
                if(!rows.isEmpty()) {
                    var row=rows.getFirst();
                    if(DbTimes.instant(row.get("expires_at")).isBefore(Instant.now())) jdbc.update("DELETE FROM mp_idempotency_record WHERE scope_hash=? AND key_hash=?",scope,keyHash);
                    else {
                        if(!Secrets.equal(fingerprint,(String)row.get("request_hmac")))throw new ApiException(409,"IDEMPOTENCY_KEY_REUSED");
                        if(!"COMPLETED".equals(row.get("status")))throw new ApiException(409,"REQUEST_IN_PROGRESS");
                        try{return new Result<>(mapper.readValue((String)row.get("safe_response_json"),responseType),true);}catch(Exception invalid){throw new IllegalStateException("Stored result invalid");}
                    }
                }
                jdbc.update("INSERT INTO mp_idempotency_record(owner_student_id,owner_intake_session_id,scope_hash,key_hash,request_hmac,status,expires_at) VALUES(?,?,?,?,?,'PROCESSING',?)",owner.studentId(),owner.intakeId(),scope,keyHash,fingerprint,Timestamp.from(Instant.now().plusSeconds(86400)));
                T result=action.get();
                jdbc.update("UPDATE mp_idempotency_record SET status='COMPLETED',safe_response_json=? WHERE scope_hash=? AND key_hash=?",json(result),scope,keyHash);
                return new Result<>(result,false);
            } finally { TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() { @Override public void afterCompletion(int completion) { jdbc.queryForObject("SELECT RELEASE_LOCK(?)",Integer.class,lock); } }); }
        });
    }
    private String json(Object value) { try{return mapper.writeValueAsString(value);}catch(Exception invalid){throw new ApiException(400,"VALIDATION_ERROR");} }
}
