package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

/** Exact upstream MIT SQL is a one-time empty-schema baseline, never a reset script. */
public class V1__RuoYiBaseline extends BaseJavaMigration {
    @Override public Integer getChecksum() { return 20260417; }
    @Override public void migrate(Context context) throws Exception {
        try (var statement = context.getConnection().createStatement();
             var rows = statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name <> 'flyway_schema_history'")) {
            rows.next();
            if (rows.getInt(1) != 0) throw new IllegalStateException("RuoYi baseline requires an empty dedicated schema; use an explicitly reviewed Flyway baseline for an existing exact upstream database");
        }
        ScriptUtils.executeSqlScript(context.getConnection(), new ClassPathResource("upstream-baseline/ry_20260417.sql"));
        ScriptUtils.executeSqlScript(context.getConnection(), new ClassPathResource("upstream-baseline/quartz.sql"));
    }
}
