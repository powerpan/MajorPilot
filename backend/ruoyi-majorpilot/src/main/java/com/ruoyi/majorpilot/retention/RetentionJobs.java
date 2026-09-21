package com.ruoyi.majorpilot.retention;

import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.shared.*;
import jakarta.annotation.PreDestroy;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Dedicated system queue. It can neither claim Student nor Operator work. */
@Service @Profile("local")
public class RetentionJobs {
    public record Lease(long id,long generation,String worker,RetentionPolicy policy,Instant asOf,int batch){}
    private final JdbcTemplate db;private final TransactionTemplate tx;private final ObjectMapper mapper;private final RetentionService service;private final Clock clock;
    private final String worker="retention-"+UUID.randomUUID();private final AtomicBoolean busy=new AtomicBoolean();
    private final ExecutorService executor=Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"majorpilot-retention");t.setDaemon(true);return t;});
    private final ScheduledExecutorService heartbeats=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"majorpilot-retention-heartbeat");t.setDaemon(true);return t;});
    @Autowired public RetentionJobs(JdbcTemplate db,TransactionTemplate tx,ObjectMapper mapper,RetentionService service){this(db,tx,mapper,service,Clock.systemUTC());}
    RetentionJobs(JdbcTemplate db,TransactionTemplate tx,ObjectMapper mapper,RetentionService service,Clock clock){this.db=db;this.tx=tx;this.mapper=mapper;this.service=service;this.clock=clock;}
    @PreDestroy public void stop(){executor.shutdownNow();heartbeats.shutdownNow();}
    @Scheduled(initialDelay=60000,fixedDelay=60000) public void enqueueDue(){for(var policy:RetentionPolicy.values())enqueue(policy,clock.instant(),RetentionPolicy.MAX_BATCH);}
    public boolean enqueue(RetentionPolicy policy,Instant now,int batch){RetentionPolicy.checkedBatch(batch);Instant asOf=now.truncatedTo(ChronoUnit.HOURS);return Boolean.TRUE.equals(tx.execute(t->{
        db.update("INSERT IGNORE INTO mp_retention_status(policy_key) VALUES(?)",policy.name());var status=db.queryForMap("SELECT * FROM mp_retention_status WHERE policy_key=? FOR UPDATE",policy.name());if(status.get("next_due_at")!=null&&DbTimes.instant(status.get("next_due_at")).isAfter(now))return false;
        if(db.queryForObject("SELECT COUNT(*) FROM mp_background_job WHERE job_type='RETENTION_CLEANUP' AND owner_student_id IS NULL AND owner_operator_id IS NULL AND target_type='RETENTION_POLICY' AND target_id=0 AND JSON_UNQUOTE(JSON_EXTRACT(checkpoint_json,'$.policyKey'))=? AND status IN ('PENDING','RUNNING','RETRY_WAIT')",Integer.class,policy.name())>0)return false;
        String checkpoint=string(Map.of("policyKey",policy.name(),"asOf",asOf.toString(),"batchSize",batch));String key=businessKey(policy,asOf);
        int inserted=db.update("INSERT IGNORE INTO mp_background_job(public_id,job_type,business_key,target_type,target_id,checkpoint_json,available_at,created_at) VALUES(?,'RETENTION_CLEANUP',?,'RETENTION_POLICY',0,?,?,?)",PublicIds.next(),key,checkpoint,Timestamp.from(now),Timestamp.from(now));db.update("UPDATE mp_retention_status SET next_due_at=? WHERE policy_key=?",Timestamp.from(asOf.plus(1,ChronoUnit.HOURS)),policy.name());return inserted==1;
    }));}
    static String businessKey(RetentionPolicy policy,Instant asOf){return "retention:"+policy.name()+":"+asOf.truncatedTo(ChronoUnit.HOURS);}
    @Scheduled(initialDelay=65000,fixedDelay=5000) public void tick(){if(!busy.compareAndSet(false,true))return;executor.execute(()->{try{var lease=claim(worker);if(lease!=null)process(lease);}finally{busy.set(false);}});}
    public Lease claim(String workerId){Instant now=clock.instant();return tx.execute(t->{var rows=db.queryForList("SELECT * FROM mp_background_job WHERE job_type='RETENTION_CLEANUP' AND target_type='RETENTION_POLICY' AND target_id=0 AND owner_student_id IS NULL AND owner_operator_id IS NULL AND ((status IN ('PENDING','RETRY_WAIT') AND available_at<=?) OR (status='RUNNING' AND lease_until<=?)) ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",Timestamp.from(now),Timestamp.from(now));if(rows.isEmpty())return null;var row=rows.getFirst();long id=n(row,"id");RetentionPolicy policy;Instant asOf;int batch;
        try{var cp=mapper.readTree(Objects.toString(row.get("checkpoint_json"),"{}"));policy=RetentionPolicy.parse(cp.path("policyKey").asText());asOf=Instant.parse(cp.path("asOf").asText());var b=cp.path("batchSize");if(!b.isIntegralNumber()||!b.canConvertToInt()||asOf.isAfter(now)||!asOf.equals(asOf.truncatedTo(ChronoUnit.HOURS))||!businessKey(policy,asOf).equals(row.get("business_key")))throw new IllegalArgumentException();batch=RetentionPolicy.checkedBatch(b.intValue());}
        catch(Exception invalid){db.update("UPDATE mp_background_job SET status='FAILED',last_error_code='RETENTION_SOURCE_INVALID',lease_until=NULL,completed_at=? WHERE id=?",Timestamp.from(now),id);return null;}
        if(n(row,"attempt_count")>=3){db.update("UPDATE mp_background_job SET status='FAILED',last_error_code='RETENTION_RETRY_EXHAUSTED',lease_until=NULL,completed_at=? WHERE id=?",Timestamp.from(now),id);db.update("UPDATE mp_retention_status SET last_error_code='RETENTION_RETRY_EXHAUSTED' WHERE policy_key=?",policy.name());return null;}
        long generation=n(row,"lease_version")+1;db.update("UPDATE mp_background_job SET status='RUNNING',attempt_count=attempt_count+1,lease_version=?,worker_id=?,lease_until=?,started_at=COALESCE(started_at,?) WHERE id=?",generation,workerId,Timestamp.from(now.plusSeconds(60)),Timestamp.from(now),id);db.update("UPDATE mp_retention_status SET last_started_at=?,last_error_code=NULL WHERE policy_key=?",Timestamp.from(now),policy.name());return new Lease(id,generation,workerId,policy,asOf,batch);
    });}
    private boolean fence(Lease l){return !db.queryForList("SELECT id FROM mp_background_job WHERE id=? AND job_type='RETENTION_CLEANUP' AND target_type='RETENTION_POLICY' AND target_id=0 AND owner_student_id IS NULL AND owner_operator_id IS NULL AND status='RUNNING' AND worker_id=? AND lease_version=? AND lease_until>? FOR UPDATE",l.id,l.worker,l.generation,Timestamp.from(clock.instant())).isEmpty();}
    // A cleanup batch may unlink files. Do not lock its queue row throughout that I/O: the
    // independent heartbeat must be able to extend it. Final publication uses a current,
    // locking read below, so a stale transaction snapshot can never publish an old lease.
    private boolean observedAlive(Lease l){return !db.queryForList("SELECT id FROM mp_background_job WHERE id=? AND job_type='RETENTION_CLEANUP' AND target_type='RETENTION_POLICY' AND target_id=0 AND owner_student_id IS NULL AND owner_operator_id IS NULL AND status='RUNNING' AND worker_id=? AND lease_version=? AND lease_until>?",l.id,l.worker,l.generation,Timestamp.from(clock.instant())).isEmpty();}
    public boolean heartbeat(Lease l){return Boolean.TRUE.equals(tx.execute(t->{if(!fence(l))return false;db.update("UPDATE mp_background_job SET lease_until=? WHERE id=?",Timestamp.from(clock.instant().plusSeconds(60)),l.id);return true;}));}
    public boolean process(Lease l){var pulse=heartbeats.scheduleAtFixedRate(()->{try{heartbeat(l);}catch(RuntimeException unavailable){/* The next fenced transaction must still succeed before any publication. */}},20,20,TimeUnit.SECONDS);try{return Boolean.TRUE.equals(tx.execute(t->{if(!observedAlive(l))return false;long count=service.run(l.policy,l.asOf,l.batch,()->observedAlive(l));if(!fence(l))throw new ApiException(409,"RETENTION_LEASE_LOST");db.update("UPDATE mp_background_job SET status='SUCCEEDED',lease_until=NULL,completed_at=?,last_error_code=NULL WHERE id=?",Timestamp.from(clock.instant()),l.id);db.update("UPDATE mp_retention_status SET last_completed_at=?,last_error_code=NULL,deleted_count=deleted_count+? WHERE policy_key=?",Timestamp.from(clock.instant()),count,l.policy.name());return true;}));}
        catch(ApiException rejected){fail(l,"RETENTION_SOURCE_INVALID".equals(rejected.code)?rejected.code:"RETENTION_BATCH_FAILED");return false;}catch(RuntimeException unavailable){fail(l,"PRIVATE_EXPORT_STORAGE_UNAVAILABLE".equals(unavailable.getMessage())?"RETENTION_STORAGE_FAILED":"RETENTION_BATCH_FAILED");return false;}finally{pulse.cancel(false);}}
    public boolean fail(Lease l,String code){String safe=Set.of("RETENTION_SOURCE_INVALID","RETENTION_STORAGE_FAILED","RETENTION_BATCH_FAILED").contains(code)?code:"RETENTION_BATCH_FAILED";return Boolean.TRUE.equals(tx.execute(t->{if(!fence(l))return false;long attempts=db.queryForObject("SELECT attempt_count FROM mp_background_job WHERE id=?",Long.class,l.id);boolean terminal=attempts>=3||"RETENTION_SOURCE_INVALID".equals(safe);Instant now=clock.instant();db.update("UPDATE mp_background_job SET status=?,last_error_code=?,lease_until=NULL,available_at=?,completed_at=? WHERE id=?",terminal?"FAILED":"RETRY_WAIT",safe,Timestamp.from(now.plusSeconds(attempts==1?5:30)),terminal?Timestamp.from(now):null,l.id);db.update("UPDATE mp_retention_status SET last_error_code=? WHERE policy_key=?",safe,l.policy.name());return true;}));}
    private static long n(Map<String,Object> row,String key){return ((Number)row.get(key)).longValue();}
    private String string(Object value){try{return mapper.writeValueAsString(value);}catch(Exception invalid){throw new IllegalArgumentException("RETENTION_SOURCE_INVALID");}}
}
