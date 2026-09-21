package majorpilot.harness;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.integration.ai.ReportGateway;
import com.ruoyi.majorpilot.report.*;
import com.ruoyi.majorpilot.report.core.ReportCore;
import com.ruoyi.majorpilot.report.core.ReportModels.*;
import java.nio.file.*;
import java.util.Map;
import java.util.Set;
import org.springframework.core.env.Environment;

/** Test-classpath only: the real job implementation, with bounded crash checkpoints. */
public final class P6HarnessReportJobs extends ReportJobs {
    private final ReportStore store;
    private final Path directory;
    private final String tag;
    public P6HarnessReportJobs(ReportStore store,ReportCore core,ReportCoordinator coordinator,ReportGateway gateway,Environment environment){
        super(store,core,coordinator,gateway);this.store=store;
        directory=Path.of(environment.getRequiredProperty("MP_P6_HARNESS_DIR")).toAbsolutePath().normalize();tag=environment.getRequiredProperty("MP_P6_RUN_TAG");
        if(!directory.endsWith("data/p6-harness")||!Files.isDirectory(directory,LinkOption.NOFOLLOW_LINKS)||!tag.matches("[a-f0-9]{16}")||!Set.of(environment.getActiveProfiles()).contains("p6-harness"))throw rejected();
    }
    @Override public Lease claim(String worker){
        Lease lease=super.claim(worker);if(lease==null)return null;
        own(lease);write("checkpoint-latest-lease.json",lease);probeOldLease(lease);
        return checkpoint("AFTER_CLAIM",lease)?lease:null;
    }
    @Override public boolean publish(Lease lease,ReportInput input,Catalog catalog,Proposal proposal,GenerationMode mode){
        if(!checkpoint("BEFORE_PUBLISH",lease))return false;
        return super.publish(lease,input,catalog,proposal,mode);
    }
    private void own(Lease lease){
        Integer count=store.db().queryForObject("SELECT COUNT(*) FROM mp_student_account a JOIN mp_report r ON r.student_id=a.id JOIN mp_report_version v ON v.report_id=r.id WHERE a.id=? AND r.id=? AND v.id=? AND a.email_normalized LIKE ?",Integer.class,lease.student(),lease.report(),lease.version(),"p6-http-"+tag+"-%@example.invalid");
        if(count==null||count!=1)throw rejected();
    }
    private boolean checkpoint(String stage,Lease lease){
        if(!control().equals(stage))return true;own(lease);
        write("checkpoint-entered.json",Map.of("stage",stage,"lease",lease));
        long deadline=System.nanoTime()+90_000_000_000L;
        try{
            while(!Files.isRegularFile(directory.resolve("checkpoint-release"),LinkOption.NOFOLLOW_LINKS)&&System.nanoTime()<deadline)Thread.sleep(50);
            return System.nanoTime()<deadline;
        }catch(InterruptedException stopped){Thread.currentThread().interrupt();return false;}
    }
    private String control(){
        Path file=directory.resolve("checkpoint-control.json");if(!Files.exists(file,LinkOption.NOFOLLOW_LINKS))return "PASS";
        JsonNode value=read(file,512);if(!value.isObject()||value.size()!=1||!value.path("stage").isTextual()||!Set.of("PASS","AFTER_CLAIM","BEFORE_PUBLISH").contains(value.path("stage").asText()))throw rejected();
        return value.path("stage").asText();
    }
    private void probeOldLease(Lease current){
        Path file=directory.resolve("checkpoint-old-lease.json");if(!Files.exists(file,LinkOption.NOFOLLOW_LINKS))return;
        try{
            Lease old=store.mapper().treeToValue(read(file,2048),Lease.class);
            if(old.job()!=current.job()||old.student()!=current.student()||old.report()!=current.report()||old.version()!=current.version()||old.leaseVersion()>=current.leaseVersion()||old.worker().equals(current.worker()))throw rejected();
            Map<String,Object> before=state(old);
            // Invoke the actual production methods. publish's ownership/lease
            // fence runs before it accesses any payload. Any bypass fails here.
            boolean heartbeatAccepted=super.heartbeat(old);
            boolean publishAccepted=super.publish(old,null,null,null,null);
            boolean unchanged=before.equals(state(old));
            write("checkpoint-old-lease-result.json",Map.of("job",current.job(),"oldLeaseVersion",old.leaseVersion(),"newLeaseVersion",current.leaseVersion(),"heartbeatAccepted",heartbeatAccepted,"publishAccepted",publishAccepted,"stateUnchanged",unchanged));
            Files.delete(file);
            if(heartbeatAccepted||publishAccepted||!unchanged)throw rejected();
        }catch(RuntimeException rejected){throw rejected;}catch(Exception failure){throw rejected();}
    }
    private Map<String,Object> state(Lease lease){
        return store.db().queryForMap("SELECT j.lease_version,j.worker_id,j.lease_until,j.status AS job_status,v.status AS version_status,v.generation_phase,v.report_body_sha256,r.current_version_id,r.generation_target_version_id,(SELECT COUNT(*) FROM mp_report_claim c WHERE c.report_version_id=v.id) AS claim_count,(SELECT COUNT(*) FROM mp_product_event e WHERE e.report_version_id=v.id) AS event_count FROM mp_background_job j JOIN mp_report_version v ON v.id=j.target_id JOIN mp_report r ON r.id=v.report_id WHERE j.id=?",lease.job());
    }
    private JsonNode read(Path file,long maximum){
        try{if(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)||Files.size(file)>maximum)throw rejected();return store.mapper().readTree(Files.readString(file));}catch(Exception failure){throw rejected();}
    }
    private void write(String name,Object value){
        Path file=directory.resolve(name),temporary=null;
        try{if(Files.isSymbolicLink(file))throw rejected();temporary=Files.createTempFile(directory,"checkpoint-write-",".tmp");Files.writeString(temporary,store.mapper().writeValueAsString(value));Files.move(temporary,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
        catch(Exception failure){throw rejected();}finally{if(temporary!=null)try{Files.deleteIfExists(temporary);}catch(Exception ignored){}}
    }
    private static IllegalStateException rejected(){return new IllegalStateException("P6 test-only report checkpoint rejected; payload suppressed");}
}
