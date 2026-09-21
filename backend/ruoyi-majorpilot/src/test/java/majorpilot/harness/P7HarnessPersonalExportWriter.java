package majorpilot.harness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.privacy.PersonalExportWriter;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

/** The reservation transaction has committed before production calls build. */
public final class P7HarnessPersonalExportWriter extends PersonalExportWriter {
    private final P7HarnessPrivacyCheckpoints checkpoints;
    P7HarnessPersonalExportWriter(JdbcTemplate db,ObjectMapper mapper,P7HarnessPrivacyCheckpoints checkpoints){super(db,mapper);this.checkpoints=checkpoints;}
    @Override public byte[] build(long student,String scope,Instant at){
        if(checkpoints.control().equals("EXPORT_RESERVED"))checkpoints.checkpoint("EXPORT_RESERVED",checkpoints.exportLease(student));
        return super.build(student,scope,at);
    }
}
