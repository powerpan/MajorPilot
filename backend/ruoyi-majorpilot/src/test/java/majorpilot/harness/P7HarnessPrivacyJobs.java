package majorpilot.harness;

import com.ruoyi.majorpilot.privacy.*;
import java.nio.file.*;
import java.util.Map;

/** All work stays in the production worker. Only test-classpath crash gates differ. */
public final class P7HarnessPrivacyJobs extends PrivacyJobs {
    private final P7HarnessPrivacyCheckpoints checkpoints;
    P7HarnessPrivacyJobs(PrivacyStore store,PrivateObjectStore files,PersonalExportWriter writer,AccountDeletionStages deletion,P7HarnessPrivacyCheckpoints checkpoints){super(store,files,writer,deletion);this.checkpoints=checkpoints;}
    @Override public Lease claim(String worker){
        Lease lease=super.claim(worker);if(lease==null)return null;checkpoints.own(lease);
        checkpoints.write("privacy-checkpoint-latest-lease.json",lease);probeOldLease(lease);return lease;
    }
    @Override public boolean deleteStage(Lease lease){
        boolean complete=super.deleteStage(lease);
        if(!complete&&checkpoints.control().equals("DELETE_FILES_COMMITTED")
                &&"METADATA".equals(checkpoints.db.queryForObject("SELECT current_stage FROM mp_account_deletion_request WHERE id=? AND student_id=?",String.class,lease.target(),lease.student())))
            checkpoints.checkpoint("DELETE_FILES_COMMITTED",lease);
        return complete;
    }
    private void probeOldLease(Lease current){
        Path file=checkpoints.directory.resolve("privacy-checkpoint-old-lease.json");if(!Files.exists(file,LinkOption.NOFOLLOW_LINKS))return;
        try{
            Lease old=checkpoints.mapper.treeToValue(checkpoints.read(file,2048),Lease.class);
            if(old.job()!=current.job()||old.student()!=current.student()||old.target()!=current.target()||!old.type().equals(current.type())
                    ||old.generation()>=current.generation()||old.worker().equals(current.worker()))throw P7HarnessPrivacyCheckpoints.rejected();
            var before=checkpoints.state(current);boolean heartbeatAccepted=super.heartbeat(old);
            // The actual processing entrypoint must reject the obsolete lease before
            // snapshot/file IO or advancing a committed deletion stage.
            super.process(old);boolean unchanged=before.equals(checkpoints.state(current));
            checkpoints.write("privacy-checkpoint-old-lease-result.json",Map.of("job",current.job(),"oldGeneration",old.generation(),"newGeneration",current.generation(),"heartbeatAccepted",heartbeatAccepted,"stateUnchanged",unchanged));
            Files.delete(file);if(heartbeatAccepted||!unchanged)throw P7HarnessPrivacyCheckpoints.rejected();
        }catch(RuntimeException invalid){throw invalid;}catch(Exception invalid){throw P7HarnessPrivacyCheckpoints.rejected();}
    }
}
