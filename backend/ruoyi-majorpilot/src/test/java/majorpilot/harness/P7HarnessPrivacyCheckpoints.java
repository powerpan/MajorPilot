package majorpilot.harness;

import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.privacy.PrivacyJobs.Lease;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.*;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

/** Test-classpath only. No HTTP control endpoint, SQL mutation or shortened lease. */
final class P7HarnessPrivacyCheckpoints {
    final JdbcTemplate db;final ObjectMapper mapper;final Path directory;private final String tag;
    P7HarnessPrivacyCheckpoints(JdbcTemplate db,ObjectMapper mapper,Environment environment){
        this.db=db;this.mapper=mapper;
        directory=Path.of(environment.getRequiredProperty("MP_P6_HARNESS_DIR")).toAbsolutePath().normalize();
        tag=environment.getRequiredProperty("MP_P6_RUN_TAG");
        if(!directory.endsWith("data/p6-harness")||!Files.isDirectory(directory,LinkOption.NOFOLLOW_LINKS)
                ||!tag.matches("[a-f0-9]{16}")||!Set.of(environment.getActiveProfiles()).equals(Set.of("local","p6-harness")))throw rejected();
        for(Path at=directory;at!=null;at=at.getParent())if(Files.isSymbolicLink(at))throw rejected();
    }
    void own(Lease lease){
        Integer count=db.queryForObject("SELECT COUNT(*) FROM mp_student_account WHERE id=? AND email_normalized LIKE ?",Integer.class,lease.student(),"p6-http-"+tag+"-%@example.invalid");
        if(count==null||count!=1)throw rejected();
    }
    String control(){
        Path path=directory.resolve("privacy-checkpoint-control.json");if(!Files.exists(path,LinkOption.NOFOLLOW_LINKS))return "PASS";
        var value=read(path,512);if(!value.isObject()||value.size()!=1||!value.path("stage").isTextual()
                ||!Set.of("PASS","EXPORT_RESERVED","DELETE_FILES_COMMITTED").contains(value.path("stage").asText()))throw rejected();
        return value.path("stage").asText();
    }
    void checkpoint(String stage,Lease lease){
        if(!control().equals(stage))return;own(lease);
        write("privacy-checkpoint-entered.json",Map.of("stage",stage,"lease",lease));
        long deadline=System.nanoTime()+90_000_000_000L;
        try{while(!Files.isRegularFile(directory.resolve("privacy-checkpoint-release"),LinkOption.NOFOLLOW_LINKS)&&System.nanoTime()<deadline)Thread.sleep(50);
            if(System.nanoTime()>=deadline)throw rejected();
        }catch(InterruptedException stopped){Thread.currentThread().interrupt();throw rejected();}
    }
    Lease exportLease(long student){
        var rows=db.queryForList("SELECT j.id,j.owner_student_id,j.target_id,j.job_type,j.lease_version,j.worker_id,j.checkpoint_json FROM mp_background_job j JOIN mp_student_data_export e ON e.id=j.target_id AND e.student_id=j.owner_student_id WHERE j.owner_student_id=? AND j.job_type='STUDENT_EXPORT' AND j.target_type='STUDENT_DATA_EXPORT' AND j.status='RUNNING' AND e.status='PROCESSING'",student);
        if(rows.size()!=1)throw rejected();var row=rows.getFirst();
        try{var artifacts=mapper.readTree(row.get("checkpoint_json").toString()).path("artifactKeys");
            if(!artifacts.isArray()||artifacts.isEmpty()||artifacts.size()>3)throw rejected();
        }catch(Exception invalid){throw rejected();}
        return new Lease(number(row,"id"),number(row,"owner_student_id"),number(row,"target_id"),row.get("job_type").toString(),number(row,"lease_version"),row.get("worker_id").toString());
    }
    Map<String,Object> state(Lease lease){
        var state=new LinkedHashMap<>(db.queryForMap("SELECT lease_version,worker_id,lease_until,status,attempt_count,checkpoint_json FROM mp_background_job WHERE id=?",lease.job()));
        String table=lease.type().equals("ACCOUNT_DELETE")?"mp_account_deletion_request":"mp_student_data_export";
        state.put("target",db.queryForMap("SELECT * FROM "+table+" WHERE id=?",lease.target()));return state;
    }
    JsonNode read(Path path,long maximum){try{if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS)||Files.size(path)>maximum)throw rejected();return mapper.readTree(Files.readString(path));}catch(Exception invalid){throw rejected();}}
    void write(String name,Object value){
        if(!name.matches("privacy-checkpoint-[a-z-]+\\.json"))throw rejected();Path destination=directory.resolve(name),temporary=null;
        try{if(Files.isSymbolicLink(destination))throw rejected();temporary=Files.createTempFile(directory,"privacy-checkpoint-write-",".tmp",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            Files.writeString(temporary,mapper.writeValueAsString(value));Files.move(temporary,destination,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
        }catch(Exception invalid){throw rejected();}finally{if(temporary!=null)try{Files.deleteIfExists(temporary);}catch(Exception ignored){}}
    }
    private static long number(Map<String,Object> row,String key){return ((Number)row.get(key)).longValue();}
    static IllegalStateException rejected(){return new IllegalStateException("P7 test-only privacy checkpoint rejected; payload suppressed");}
}
