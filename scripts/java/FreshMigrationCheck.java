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
            String expected=System.getenv("MP_MIGRATION_EXPECTED_VERSION");
            require(schema!=null&&schema.matches("majorpilotmigration[0-9a-f]{16}"));
            require(account!=null&&account.matches("mp_mig_[0-9a-f]{16}"));
            require(password!=null&&password.matches("[0-9a-f]{64}"));
            require(expected!=null&&expected.matches("[1-9][0-9]{0,2}"));
            int expectedVersion=Integer.parseInt(expected);
            String from=System.getenv("MP_MIGRATION_FROM_VERSION");
            require(from==null||from.equals("6")&&expectedVersion>=7);
            boolean upgrade=from!=null;
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
            String originalStudent=null;
            if(upgrade){
                var baseline=Flyway.configure().dataSource(url,account,password).locations("classpath:db/migration").target("6").cleanDisabled(true).load();
                require(baseline.migrate().migrationsExecuted==6);
                require(baseline.validateWithResult().validationSuccessful);
                try(Connection connection=DriverManager.getConnection(url,account,password);var statement=connection.createStatement()){
                    // Standalone synthetic row in a newly created schema, never a
                    // product account or claim of a completed business workflow.
                    statement.executeUpdate("INSERT INTO mp_student_account(public_id,email_normalized,email_display,status,row_version) VALUES('01JF6000000000000000000001','migration-sentinel@example.invalid','Migration TEST_FIXTURE','LOCKED',7)");
                    originalStudent=studentSnapshot(connection);
                }
            }
            Flyway flyway=Flyway.configure().dataSource(url,account,password).locations("classpath:db/migration").cleanDisabled(true).load();
            var first=flyway.migrate();require(first.migrationsExecuted==expectedVersion-(upgrade?6:0));
            require(flyway.validateWithResult().validationSuccessful);
            var second=flyway.migrate();require(second.migrationsExecuted==0);
            require(flyway.info().pending().length==0);
            List<Map<String,Object>> history=new ArrayList<>();
            int after,keyTables,p2Tables=0,p3Tables=0,p6Tables=0,p6ForeignKeys=0;
            boolean studentJobOwnership=false,p0QueuePreserved=false,existingStudentPreserved=false;
            try(Connection connection=DriverManager.getConnection(url,account,password)) {
                after=tableCount(connection);
                try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT version,description,type,checksum,success FROM flyway_schema_history ORDER BY installed_rank")) {
                    while(rows.next()) {
                        Map<String,Object> row=new LinkedHashMap<>();row.put("version",rows.getString("version"));row.put("description",rows.getString("description"));row.put("type",rows.getString("type"));row.put("checksum",rows.getInt("checksum"));row.put("success",rows.getBoolean("success"));history.add(row);
                    }
                }
                require(history.size()==expectedVersion);
                for(int index=0;index<expectedVersion;index++){require(history.get(index).get("version").equals(Integer.toString(index+1)));require(Boolean.TRUE.equals(history.get(index).get("success")));}
                try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('mp_student_account','mp_student_session','mp_email_token','mp_intake_session','mp_decision_profile','mp_decision_answer','mp_recommendation','mp_recommendation_reason','mp_recommendation_decision','mp_consent_record','mp_idempotency_record','mp_security_event','mp_product_event')")) { rows.next();keyTables=rows.getInt(1); }
                require(keyTables==13&&after>keyTables);
                if(expectedVersion>=5) {
                    try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('mp_major','mp_task_version','mp_experience_run','mp_step_state','mp_step_response_revision','mp_execution_record','mp_response_execution','mp_hint_request','mp_reflection','mp_reflection_answer','mp_run_closure_request','mp_sensitive_audit','mp_step_completion')")) { rows.next();p2Tables=rows.getInt(1); }
                    require(p2Tables==13);
                }
                if(expectedVersion>=6) {
                    try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('mp_p0_background_job','mp_background_job','mp_evidence_snapshot','mp_evidence_item','mp_report','mp_ai_call')")) { rows.next();p3Tables=rows.getInt(1); }
                    require(p3Tables==6);
                    try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='mp_background_job' AND column_name='owner_student_id' AND referenced_table_name='mp_student_account' AND referenced_column_name='id'")) { rows.next();studentJobOwnership=rows.getInt(1)==1; }
                    try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='mp_p0_background_job' AND column_name='owner_student_id' AND data_type='char' AND character_maximum_length=36")) { rows.next();p0QueuePreserved=rows.getInt(1)==1; }
                    require(studentJobOwnership&&p0QueuePreserved);
                }
                if(expectedVersion>=7){
                    try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('mp_report_version','mp_report_claim','mp_report_claim_evidence','mp_comparison_source','mp_student_feedback')")){rows.next();p6Tables=rows.getInt(1);}
                    require(p6Tables==5);
                    try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND constraint_name IN ('fk_report_current_version','fk_report_target_version','fk_ai_report_version','fk_evidence_origin_job','fk_event_report','fk_event_report_version','fk_event_feedback') AND referenced_table_name IS NOT NULL")){rows.next();p6ForeignKeys=rows.getInt(1);}
                    require(p6ForeignKeys==7);
                    try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.check_constraints c JOIN information_schema.table_constraints t ON t.constraint_schema=c.constraint_schema AND t.constraint_name=c.constraint_name WHERE c.constraint_schema=DATABASE() AND t.table_name='mp_report_version' AND (c.check_clause LIKE '%retry_no%' OR c.check_clause LIKE '%http_attempt_count%')")){rows.next();require(rows.getInt(1)==2);}
                }
                if(upgrade){existingStudentPreserved=originalStudent.equals(studentSnapshot(connection));require(existingStudentPreserved);}
            }
            Map<String,Object> result=new LinkedHashMap<>();result.put("result","PASS");result.put("emptyTableCount",before);result.put("migratedTableCount",after);result.put("p1TableCount",keyTables);result.put("p2TableCount",p2Tables);result.put("p3TableCount",p3Tables);result.put("studentJobOwnership",studentJobOwnership);result.put("p0QueuePreserved",p0QueuePreserved);result.put("expectedVersion",expectedVersion);result.put("firstMigrationsExecuted",first.migrationsExecuted);result.put("secondMigrationsExecuted",second.migrationsExecuted);result.put("validated",true);result.put("history",history);
            result.put("migrationPath",upgrade?"V1-V6 plus existing row, then upgrade":"empty V1-latest");result.put("existingStudentPreserved",existingStudentPreserved);result.put("p6TableCount",p6Tables);result.put("p6ForeignKeyCount",p6ForeignKeys);
            System.out.println("MAJORPILOT_MIGRATION_RESULT="+new ObjectMapper().writeValueAsString(result));
        } catch(Exception failure) {
            // JDBC/Flyway diagnostics can contain connection identity or SQL. Do not log them.
            System.err.println("MIGRATION_CHECK_FAILED");System.exit(1);
        }
    }
    private static int tableCount(Connection connection)throws Exception { try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")){rows.next();return rows.getInt(1);} }
    private static String studentSnapshot(Connection connection)throws Exception {try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT JSON_OBJECT('id',id,'publicId',public_id,'email',email_normalized,'display',email_display,'password',password_hash,'status',status,'verified',email_verified_at,'failures',failed_login_count,'locked',locked_until,'lastLogin',last_login_at,'deletionRequested',deletion_requested_at,'deleted',deleted_at,'revision',row_version,'created',created_at,'updated',updated_at) FROM mp_student_account WHERE public_id='01JF6000000000000000000001'")){require(rows.next());return rows.getString(1);}}
    private static void require(boolean value){if(!value)throw new IllegalStateException("Migration assertion failed");}
}
