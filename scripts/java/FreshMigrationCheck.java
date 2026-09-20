import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.Flyway;

/** Standalone Flyway only: no Spring application, HTTP listener or background job. */
public final class FreshMigrationCheck {
    public static void main(String[] args) {
        try {
            String schema=System.getenv("MP_MIGRATION_SCHEMA");
            String account=System.getenv("MP_MIGRATION_ACCOUNT");
            String password=System.getenv("MP_MIGRATION_PASSWORD");
            require(schema!=null&&schema.matches("majorpilotmigration[0-9a-f]{16}"));
            require(account!=null&&account.matches("mp_mig_[0-9a-f]{16}"));
            require(password!=null&&password.matches("[0-9a-f]{64}"));
            String url="jdbc:mysql://127.0.0.1:13306/"+schema+"?useUnicode=true&characterEncoding=utf8&serverTimezone=UTC";
            int before;
            try(Connection connection=DriverManager.getConnection(url,account,password)) {
                before=tableCount(connection);require(before==0);
                // Inspect grants without printing account names. No application schema is queried.
                try(var statement=connection.createStatement();var grants=statement.executeQuery("SHOW GRANTS FOR CURRENT_USER()")) {
                    boolean schemaGrant=false;
                    while(grants.next()) {
                        String grant=grants.getString(1);
                        require(!grant.contains("WITH GRANT OPTION"));
                        if(grant.startsWith("GRANT USAGE ON *.* TO "))continue;
                        require(grant.contains(" ON `"+schema+"`.* TO "));schemaGrant=true;
                    }
                    require(schemaGrant);
                }
            }
            Flyway flyway=Flyway.configure().dataSource(url,account,password).locations("classpath:db/migration").cleanDisabled(true).load();
            var first=flyway.migrate();require(first.migrationsExecuted==3);
            require(flyway.validateWithResult().validationSuccessful);
            var second=flyway.migrate();require(second.migrationsExecuted==0);
            require(flyway.info().pending().length==0);
            List<Map<String,Object>> history=new ArrayList<>();
            int after,keyTables;
            try(Connection connection=DriverManager.getConnection(url,account,password)) {
                after=tableCount(connection);
                try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT version,description,type,checksum,success FROM flyway_schema_history ORDER BY installed_rank")) {
                    while(rows.next()) {
                        Map<String,Object> row=new LinkedHashMap<>();row.put("version",rows.getString("version"));row.put("description",rows.getString("description"));row.put("type",rows.getString("type"));row.put("checksum",rows.getInt("checksum"));row.put("success",rows.getBoolean("success"));history.add(row);
                    }
                }
                require(history.size()==3);
                for(int index=0;index<3;index++){require(history.get(index).get("version").equals(Integer.toString(index+1)));require(Boolean.TRUE.equals(history.get(index).get("success")));}
                try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('mp_student_account','mp_student_session','mp_email_token','mp_intake_session','mp_decision_profile','mp_decision_answer','mp_recommendation','mp_recommendation_reason','mp_recommendation_decision','mp_consent_record','mp_idempotency_record','mp_security_event','mp_product_event')")) { rows.next();keyTables=rows.getInt(1); }
                require(keyTables==13&&after>keyTables);
            }
            Map<String,Object> result=new LinkedHashMap<>();result.put("result","PASS");result.put("emptyTableCount",before);result.put("migratedTableCount",after);result.put("p1TableCount",keyTables);result.put("firstMigrationsExecuted",first.migrationsExecuted);result.put("secondMigrationsExecuted",second.migrationsExecuted);result.put("validated",true);result.put("history",history);
            System.out.println("MAJORPILOT_MIGRATION_RESULT="+new ObjectMapper().writeValueAsString(result));
        } catch(Exception failure) {
            // JDBC/Flyway diagnostics can contain connection identity or SQL. Do not log them.
            System.err.println("MIGRATION_CHECK_FAILED");System.exit(1);
        }
    }
    private static int tableCount(Connection connection)throws Exception { try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")){rows.next();return rows.getInt(1);} }
    private static void require(boolean value){if(!value)throw new IllegalStateException("Migration assertion failed");}
}
