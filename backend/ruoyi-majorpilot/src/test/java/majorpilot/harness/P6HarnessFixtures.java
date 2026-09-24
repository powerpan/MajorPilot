package majorpilot.harness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.content.TaskContentRepository;
import com.ruoyi.majorpilot.report.claims.EvidenceRuleRegistry;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** Synthetic published-state preconditions, never records of a human review. */
@Configuration @Profile("p6-harness")
public class P6HarnessFixtures {
    public static final Map<String,String> IDS = Map.of(
        "AI", "01JF1000000000000000000001",
        "DATA_SCIENCE", "01JF2000000000000000000001",
        "BUSINESS_ANALYTICS", "01JF3000000000000000000001");

    @Bean @Primary
    EvidenceRuleRegistry p6TestEvidenceRegistry(TaskContentRepository repository) {
        var entries = new ArrayList<EvidenceRuleRegistry.Compatibility>();
        if (repository.bundles().size() != 3) throw new IllegalStateException("Harness catalog must contain exactly three TEST_FIXTURE bundles");
        for (var bundle : repository.bundles()) {
            var manifest = bundle.manifest();
            String major = manifest.path("majorCode").asText(), task = manifest.path("taskVersionId").asText();
            if (!task.equals(IDS.get(major)) || !manifest.path("title").asText().startsWith("TEST_FIXTURE")
                || !(com.ruoyi.majorpilot.learning.MethodGuide.enabled(manifest)?"2.0.0":"9.6.0").equals(manifest.path("versionCode").asText())
                || !bundle.path().startsWith("p6-fixtures/")) throw new IllegalStateException("Unexpected harness content");
            var production = EvidenceRuleRegistry.production().stream().filter(entry -> entry.majorCode().equals(major)).findFirst().orElseThrow();
            var steps = new ArrayList<String>();
            manifest.path("steps").forEach(step -> steps.add(step.path("stepKey").asText()));
            entries.add(new EvidenceRuleRegistry.Compatibility("closed-input-v3", major, task, bundle.manifestSha256(),
                manifest.path("reflection").path("questionSetVersion").asText(), production.oldRule(), production.newRule(), steps));
        }
        return new EvidenceRuleRegistry(entries);
    }

    @Bean
    FixtureInstaller p6TestFixtureInstaller(JdbcTemplate db, TransactionTemplate tx, TaskContentRepository repository, ObjectMapper mapper) {
        return new FixtureInstaller(db, tx, repository, mapper);
    }

    static final class FixtureInstaller {
        private final JdbcTemplate db;
        private final TransactionTemplate tx;
        private final TaskContentRepository repository;
        private final ObjectMapper mapper;
        FixtureInstaller(JdbcTemplate db, TransactionTemplate tx, TaskContentRepository repository, ObjectMapper mapper) {
            this.db=db; this.tx=tx; this.repository=repository; this.mapper=mapper;
        }
        @EventListener(ApplicationReadyEvent.class)
        public void install() {
            if (!"majorpilot_test".equals(db.queryForObject("SELECT DATABASE()", String.class)))
                throw new IllegalStateException("Harness fixture database rejected");
            for (var bundle : repository.bundles()) tx.executeWithoutResult(ignored -> {
                var manifest=bundle.manifest(); String id=manifest.path("taskVersionId").asText();
                if (!IDS.containsValue(id)) throw new IllegalStateException("Harness task identity rejected");
                var existing=db.queryForList("SELECT status,manifest_sha256 FROM mp_task_version WHERE public_id=? FOR UPDATE", id);
                if (!existing.isEmpty()) {
                    if (existing.size()!=1 || !"PUBLISHED".equals(existing.getFirst().get("status"))
                        || !bundle.manifestSha256().equals(existing.getFirst().get("manifest_sha256")))
                        throw new IllegalStateException("Existing harness fixture has unexpected state");
                    return;
                }
                Long major=db.queryForObject("SELECT id FROM mp_major WHERE code=?", Long.class, manifest.path("majorCode").asText());
                db.update("INSERT INTO mp_task_version(public_id,content_kind,major_id,demo_key,version_code,status,manifest_path,manifest_sha256,data_sha256,content_schema_version,manifest_json,published_at,review_note,review_checks_json) VALUES(?,'MAJOR',?,NULL,?,'PUBLISHED',?,?,?,?,?,UTC_TIMESTAMP(3),?,?)",
                    id,major,manifest.path("versionCode").asText(),bundle.path(),bundle.manifestSha256(),bundle.dataSha256(),manifest.path("schemaVersion").asText(),manifest.toString(),
                    "TEST_FIXTURE only: published-state test precondition; human professional review and user timing NOT performed",
                    "{\"TEST_FIXTURE\":true,\"PROFESSIONAL_CORE\":false,\"TIMING_45_60\":false}");
            });
        }
    }
}
