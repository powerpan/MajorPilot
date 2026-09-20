package com.ruoyi.majorpilot.p0;

import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Only processes synthetic P0_PROBE jobs, never production job types. */
@Component @Profile("p0") @EnableScheduling
@ConditionalOnProperty(name="majorpilot.p0.worker-enabled",havingValue="true",matchIfMissing=true)
public class P0JobWorker {
    private final P0JobStore jobs;private final String worker="p0-"+UUID.randomUUID();
    public P0JobWorker(P0JobStore jobs) { this.jobs=jobs; }
    @Scheduled(fixedDelay=5000,initialDelay=5000) public void poll() {
        P0JobStore.Lease lease=jobs.claim(worker);
        if(lease!=null) jobs.complete(lease);
    }
}
