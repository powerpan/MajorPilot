import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Types;
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
            require(from==null||((from.equals("6")||from.equals("7"))&&expectedVersion>Integer.parseInt(from)));
            boolean upgrade=from!=null;
            int fromVersion=upgrade?Integer.parseInt(from):0;
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
            String originalStudent=null,originalJob=null;
            List<List<String>> originalRoleGrants=null;
            if(upgrade){
                var baseline=Flyway.configure().dataSource(url,account,password).locations("classpath:db/migration").target(from).cleanDisabled(true).load();
                require(baseline.migrate().migrationsExecuted==fromVersion);
                require(baseline.validateWithResult().validationSuccessful);
                try(Connection connection=DriverManager.getConnection(url,account,password);var statement=connection.createStatement()){
                    // Standalone synthetic row in a newly created schema, never a
                    // product account or claim of a completed business workflow.
                    statement.executeUpdate("INSERT INTO mp_student_account(public_id,email_normalized,email_display,status,row_version) VALUES('01JF6000000000000000000001','migration-sentinel@example.invalid','Migration TEST_FIXTURE','LOCKED',7)");
                    statement.executeUpdate("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_student_id,target_type,target_id,target_version,status,attempt_count,checkpoint_json) SELECT '01JF6000000000000000000002','EVIDENCE_BUILD','migration-sentinel-job',id,'MIGRATION_TEST_FIXTURE',1,7,'CANCELLED',2,JSON_OBJECT('fixture',true) FROM mp_student_account WHERE public_id='01JF6000000000000000000001'");
                    originalStudent=studentSnapshot(connection);
                    originalJob=jobSnapshot(connection);
                    originalRoleGrants=roleGrantSnapshot(connection);
                }
            }
            Flyway flyway=Flyway.configure().dataSource(url,account,password).locations("classpath:db/migration").cleanDisabled(true).load();
            var first=flyway.migrate();require(first.migrationsExecuted==expectedVersion-fromVersion);
            require(flyway.validateWithResult().validationSuccessful);
            var second=flyway.migrate();require(second.migrationsExecuted==0);
            require(flyway.info().pending().length==0);
            List<Map<String,Object>> history=new ArrayList<>();
            int after,keyTables,p2Tables=0,p3Tables=0,p6Tables=0,p6ForeignKeys=0,p7Tables=0;
            boolean studentJobOwnership=false,p0QueuePreserved=false,existingStudentPreserved=false,existingJobPreserved=false,existingRoleGrantsPreserved=false;
            Map<String,Object> p7=new LinkedHashMap<>();
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
                if(expectedVersion>=8){
                    p7Tables=scalar(connection,"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('mp_student_data_export','mp_admin_export','mp_admin_export_student','mp_account_deletion_request','mp_retention_status')");
                    require(p7Tables==5);
                    p7=checkP7(connection);
                }
                if(upgrade){
                    existingStudentPreserved=originalStudent.equals(studentSnapshot(connection));require(existingStudentPreserved);
                    existingJobPreserved=originalJob.equals(jobSnapshot(connection));require(existingJobPreserved);
                    existingRoleGrantsPreserved=originalRoleGrants.equals(roleGrantSnapshot(connection));require(existingRoleGrantsPreserved);
                    if(expectedVersion>=8){
                        require(scalar(connection,"SELECT COUNT(*) FROM mp_student_account WHERE public_id='01JF6000000000000000000001' AND analytics_exclusion_code IS NULL")==1);
                        require(scalar(connection,"SELECT COUNT(*) FROM mp_background_job WHERE public_id='01JF6000000000000000000002' AND owner_operator_id IS NULL")==1);
                    }
                }
            }
            Map<String,Object> result=new LinkedHashMap<>();result.put("result","PASS");result.put("emptyTableCount",before);result.put("migratedTableCount",after);result.put("p1TableCount",keyTables);result.put("p2TableCount",p2Tables);result.put("p3TableCount",p3Tables);result.put("studentJobOwnership",studentJobOwnership);result.put("p0QueuePreserved",p0QueuePreserved);result.put("expectedVersion",expectedVersion);result.put("firstMigrationsExecuted",first.migrationsExecuted);result.put("secondMigrationsExecuted",second.migrationsExecuted);result.put("validated",true);result.put("history",history);
            result.put("migrationPath",upgrade?"V1-V"+fromVersion+" plus existing rows, then upgrade":"empty V1-latest");result.put("upgradeFromVersion",upgrade?fromVersion:null);result.put("existingStudentPreserved",existingStudentPreserved);result.put("existingJobPreserved",existingJobPreserved);result.put("existingRoleGrantsPreserved",existingRoleGrantsPreserved);result.put("p6TableCount",p6Tables);result.put("p6ForeignKeyCount",p6ForeignKeys);result.put("p7TableCount",p7Tables);result.put("p7Checks",p7);
            System.out.println("MAJORPILOT_MIGRATION_RESULT="+new ObjectMapper().writeValueAsString(result));
        } catch(Exception failure) {
            // JDBC/Flyway diagnostics can contain connection identity or SQL. Do not log them.
            System.err.println("MIGRATION_CHECK_FAILED");System.exit(1);
        }
    }
    private static int tableCount(Connection connection)throws Exception { try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")){rows.next();return rows.getInt(1);} }
    private static String studentSnapshot(Connection connection)throws Exception {try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT JSON_OBJECT('id',id,'publicId',public_id,'email',email_normalized,'display',email_display,'password',password_hash,'status',status,'verified',email_verified_at,'failures',failed_login_count,'locked',locked_until,'lastLogin',last_login_at,'deletionRequested',deletion_requested_at,'deleted',deleted_at,'revision',row_version,'created',created_at,'updated',updated_at) FROM mp_student_account WHERE public_id='01JF6000000000000000000001'")){require(rows.next());return rows.getString(1);}}
    private static String jobSnapshot(Connection connection)throws Exception {try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT JSON_OBJECT('id',id,'publicId',public_id,'type',job_type,'businessKey',business_key,'student',owner_student_id,'targetType',target_type,'targetId',target_id,'targetVersion',target_version,'status',status,'attempt',attempt_count,'available',available_at,'leaseUntil',lease_until,'leaseVersion',lease_version,'worker',worker_id,'checkpoint',checkpoint_json,'error',last_error_code,'started',started_at,'completed',completed_at,'created',created_at) FROM mp_background_job WHERE public_id='01JF6000000000000000000002'")){require(rows.next());return rows.getString(1);}}
    private static List<List<String>> roleGrantSnapshot(Connection connection)throws Exception {
        List<List<String>> result=new ArrayList<>();
        try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT role_id,menu_id FROM sys_role_menu ORDER BY role_id,menu_id")){while(rows.next())result.add(List.of(rows.getString(1),rows.getString(2)));}
        return result;
    }
    private static int scalar(Connection connection,String sql)throws Exception {try(var statement=connection.createStatement();var rows=statement.executeQuery(sql)){require(rows.next());return rows.getInt(1);}}
    private static Map<String,Object> checkP7(Connection connection)throws Exception {
        Map<String,Object> result=new LinkedHashMap<>();
        // The Student FK remains unsigned; both Operator columns must match the
        // signed RuoYi primary key. Merely finding a column name is insufficient.
        require(scalar(connection,"SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='mp_background_job' AND column_name='owner_student_id' AND is_nullable='YES' AND data_type='bigint' AND column_type LIKE '%unsigned%'")==1);
        require(scalar(connection,"SELECT COUNT(*) FROM information_schema.columns c JOIN information_schema.columns u ON u.table_schema=c.table_schema AND u.table_name='sys_user' AND u.column_name='user_id' WHERE c.table_schema=DATABASE() AND ((c.table_name='mp_background_job' AND c.column_name='owner_operator_id' AND c.is_nullable='YES') OR (c.table_name='mp_admin_export' AND c.column_name='operator_id' AND c.is_nullable='NO')) AND c.data_type='bigint' AND c.column_type NOT LIKE '%unsigned%' AND c.column_type=u.column_type")==2);
        require(scalar(connection,"SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND ((table_name='mp_background_job' AND column_name='owner_operator_id' AND constraint_name='fk_job_operator') OR (table_name='mp_admin_export' AND column_name='operator_id' AND constraint_name='fk_admin_export_operator')) AND referenced_table_name='sys_user' AND referenced_column_name='user_id'")==2);
        require(scalar(connection,"SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='mp_background_job' AND constraint_name='ck_job_type_owner' AND constraint_type='CHECK' AND enforced='YES'")==1);
        result.put("studentOwnerNullable",true);result.put("operatorColumnsSigned",true);result.put("operatorForeignKeyCount",2);result.put("jobOwnerCheckEnforced",true);

        // Exact IDs and permission sets catch missing or accidentally broader
        // menus; no migration may silently grant them to an Operator role.
        String menuIds="7000,7001,7002,7003,7004,7005,7006,7007,7010,7011,7012,7013,7014,7015,7016,7017";
        require(scalar(connection,"SELECT COUNT(*) FROM sys_menu WHERE menu_id IN ("+menuIds+")")==16);
        require(scalar(connection,"SELECT COUNT(*) FROM sys_role_menu WHERE menu_id IN ("+menuIds+")")==0);
        Map<String,String> permissions=new LinkedHashMap<>();
        permissions.put("7001","majorpilot:overview:view");permissions.put("7002","majorpilot:student:view");permissions.put("7003","majorpilot:experience:view");permissions.put("7004","majorpilot:report:view");permissions.put("7005","majorpilot:task:view");permissions.put("7006","majorpilot:export:create");permissions.put("7007","majorpilot:audit:view");permissions.put("7010","majorpilot:analytics:manage");permissions.put("7011","majorpilot:student:sensitive");permissions.put("7012","majorpilot:experience:sensitive");permissions.put("7013","majorpilot:recovery:create");permissions.put("7014","majorpilot:report:regenerate");permissions.put("7015","majorpilot:report:history:view");permissions.put("7016","majorpilot:report:sensitive:view");permissions.put("7017","majorpilot:task:publish");
        try(var statement=connection.createStatement();var rows=statement.executeQuery("SELECT menu_id,perms FROM sys_menu WHERE menu_id IN ("+menuIds+") AND menu_id<>7000 ORDER BY menu_id")){
            int count=0;while(rows.next()){require(rows.getString(2).equals(permissions.get(rows.getString(1))));count++;}require(count==15);
        }
        result.put("menuCount",16);result.put("permissionCount",15);result.put("implicitRoleGrantCount",0);

        // Exercise the actual CHECK, including all four owner combinations for
        // every supported type plus an unknown type. Roll back every probe row.
        connection.setAutoCommit(false);
        int accepted=0,rejected=0;
        try {
            try(var statement=connection.createStatement()){
                statement.executeUpdate("INSERT INTO mp_student_account(public_id,email_normalized,email_display,status) VALUES('01JF8000000000000000000001','migration-owner-probe@example.invalid','Migration TEST_FIXTURE','LOCKED')");
            }
            long student=scalar(connection,"SELECT id FROM mp_student_account WHERE public_id='01JF8000000000000000000001'");
            long operator=scalar(connection,"SELECT MIN(user_id) FROM sys_user");require(operator>0);
            String[] types={"EVIDENCE_BUILD","EVIDENCE_REBUILD","REPORT_GENERATE","COMPARISON_GENERATE","STUDENT_EXPORT","ACCOUNT_DELETE","ADMIN_EXPORT","RETENTION_CLEANUP","UNKNOWN_JOB_TYPE"};
            int sequence=0;
            for(int typeIndex=0;typeIndex<types.length;typeIndex++)for(int owners=0;owners<4;owners++){
                boolean studentOwner=(owners&1)!=0,operatorOwner=(owners&2)!=0;
                boolean expected=typeIndex<6?studentOwner&&!operatorOwner:typeIndex==6?!studentOwner&&operatorOwner:typeIndex==7&&!studentOwner&&!operatorOwner;
                try(var insert=connection.prepareStatement("INSERT INTO mp_background_job(public_id,job_type,business_key,owner_student_id,owner_operator_id,target_type,target_id) VALUES(?,?,?,?,?,'MIGRATION_TEST_FIXTURE',1)")){
                    sequence++;insert.setString(1,String.format("%026d",sequence));insert.setString(2,types[typeIndex]);insert.setString(3,"migration-owner-probe:"+sequence);
                    if(studentOwner)insert.setLong(4,student);else insert.setNull(4,Types.BIGINT);
                    if(operatorOwner)insert.setLong(5,operator);else insert.setNull(5,Types.BIGINT);
                    try{require(insert.executeUpdate()==1);require(expected);accepted++;}
                    catch(SQLException invalid){require(!expected&&invalid.getErrorCode()==3819&&invalid.getMessage()!=null&&invalid.getMessage().contains("ck_job_type_owner"));rejected++;}
                }
            }
            require(accepted==8&&rejected==28);
        } finally {connection.rollback();connection.setAutoCommit(true);}
        require(scalar(connection,"SELECT COUNT(*) FROM mp_student_account WHERE public_id='01JF8000000000000000000001'")==0);
        require(scalar(connection,"SELECT COUNT(*) FROM mp_background_job WHERE business_key LIKE 'migration-owner-probe:%'")==0);
        result.put("validJobOwnerCases",accepted);result.put("invalidJobOwnerCases",rejected);result.put("ownerProbeRolledBack",true);
        return result;
    }
    private static void require(boolean value){if(!value)throw new IllegalStateException("Migration assertion failed");}
}
