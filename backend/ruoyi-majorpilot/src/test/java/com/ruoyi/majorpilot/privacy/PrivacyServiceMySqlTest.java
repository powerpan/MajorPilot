package com.ruoyi.majorpilot.privacy;

import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.auth.StudentPasswords;
import com.ruoyi.majorpilot.auth.StudentSessions;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Opt-in request-side integration. Requires already applied V8; never runs migrations itself. */
@EnabledIfEnvironmentVariable(named="MP_RUN_MYSQL_TESTS",matches="true")
class PrivacyServiceMySqlTest {
    private static final String PASSWORD="synthetic privacy passphrase";
    private static JdbcTemplate db;private static TransactionTemplate tx;private static ObjectMapper mapper;private static StudentPasswords passwords;
    private static final Secrets SECRETS=new Secrets("synthetic-p7-privacy-secret-".repeat(3));
    @TempDir Path folder;
    private final List<Long> students=new ArrayList<>(),operators=new ArrayList<>();
    private final List<String> deletionIds=new ArrayList<>();
    private StudentPrincipal student;private StudentSessions sessions;private PrivacyService service;private RateLimits limits;private PrivateObjectStore files;
    @BeforeAll static void database(){
        String url=System.getenv("MP_DB_URL");if(url==null||!url.startsWith("jdbc:mysql://127.0.0.1:13306/majorpilot?"))throw new IllegalStateException("Dedicated local test schema required");
        var source=new DriverManagerDataSource(url.replace("/majorpilot?","/majorpilot_test?"),System.getenv("MP_DB_USERNAME"),System.getenv("MP_DB_PASSWORD"));db=new JdbcTemplate(source);assertEquals("majorpilot_test",db.queryForObject("SELECT DATABASE()",String.class));assertEquals(1L,db.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='8' AND success=1",Long.class),"Root must apply V8 before this opt-in suite");
        tx=new TransactionTemplate(new DataSourceTransactionManager(source));mapper=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);passwords=new StudentPasswords();
    }
    @BeforeEach void setup()throws Exception{
        student=account("ACTIVE");sessions=new StudentSessions(db);limits=mock(RateLimits.class);files=new PrivateObjectStore(folder.toRealPath().toString());service=new PrivacyService(new PrivacyStore(db,tx,mapper),new IdempotencyService(db,tx,SECRETS,mapper),limits,passwords,sessions,files);
    }
    @AfterEach void cleanup(){
        for(long operator:operators){db.update("DELETE m FROM mp_admin_export_student m JOIN mp_admin_export e ON e.id=m.export_id WHERE e.operator_id=?",operator);db.update("DELETE FROM mp_admin_export WHERE operator_id=?",operator);db.update("DELETE FROM sys_user WHERE user_id=?",operator);}
        for(long id:students){db.update("DELETE FROM mp_background_job WHERE owner_student_id=?",id);db.update("DELETE FROM mp_idempotency_record WHERE owner_student_id=?",id);db.update("DELETE FROM mp_student_data_export WHERE student_id=?",id);db.update("DELETE FROM mp_account_deletion_request WHERE student_id=?",id);for(String table:List.of("mp_email_token","mp_student_session","mp_security_event","mp_product_event"))db.update("DELETE FROM "+table+" WHERE student_id=?",id);db.update("DELETE FROM mp_student_account WHERE id=?",id);}
        // Completed receipts are deliberately detached; remove only recorded test request IDs.
        for(String id:deletionIds)db.update("DELETE FROM mp_account_deletion_request WHERE public_id=?",id);
    }
    @Test void twoScopesRemainDistinctReplaysReuseAndThirdPendingIsRejected(){
        String key=key();var one=service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key);assertEquals(one,service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key));
        assertEquals("IDEMPOTENCY_KEY_REUSED",failure(()->service.requestExport(student,new PrivacyDtos.ExportRequest("FULL_PERSONAL_EXPORT"),key)).code);
        var two=service.requestExport(student,new PrivacyDtos.ExportRequest("FULL_PERSONAL_EXPORT"),key());assertNotEquals(one.exportId(),two.exportId());assertEquals(2L,count("SELECT COUNT(*) FROM mp_background_job WHERE owner_student_id=? AND job_type='STUDENT_EXPORT'",student.internalId()));
        assertEquals("EXPORT_IN_PROGRESS",failure(()->service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key())).code);assertEquals(2L,count("SELECT COUNT(*) FROM mp_student_data_export WHERE student_id=?",student.internalId()));
    }
    @Test void pendingLimitIsSerializedForConcurrentDifferentKeys()throws Exception{
        service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key());
        try(var pool=Executors.newFixedThreadPool(2)){
            var results=pool.invokeAll(List.<Callable<String>>of(()->attemptExport(),()->attemptExport()));var outcomes=List.of(results.get(0).get(),results.get(1).get());assertEquals(1,Collections.frequency(outcomes,"REQUESTED"));assertEquals(1,Collections.frequency(outcomes,"EXPORT_IN_PROGRESS"));
        }
        assertEquals(2L,count("SELECT COUNT(*) FROM mp_student_data_export WHERE student_id=?",student.internalId()));
    }
    @Test void unverifiedAccountsCanExportButOtherOwnersCannotReadOrDownload(){
        var pending=account("PENDING_VERIFICATION");var result=service.requestExport(pending,new PrivacyDtos.ExportRequest("FULL_PERSONAL_EXPORT"),key());assertEquals("REQUESTED",service.exportStatus(pending,result.exportId()).status());assertEquals(404,failure(()->service.exportStatus(student,result.exportId())).status);assertEquals(404,failure(()->service.download(student,result.exportId())).status);
    }
    @Test void listIsLatestTwentySafeRequestsAndExpiredReadyIsProjectedExpired()throws Exception{
        for(int i=0;i<22;i++)db.update("INSERT INTO mp_student_data_export(public_id,student_id,scope,status) VALUES(?,?,'REPORTS_ONLY','FAILED')",PublicIds.next(),student.internalId());var listed=service.exports(student);assertEquals(20,listed.size());assertEquals(db.queryForObject("SELECT public_id FROM mp_student_data_export WHERE student_id=? ORDER BY id DESC LIMIT 1",String.class,student.internalId()),listed.getFirst().exportId());
        var ready=readyExport();db.update("UPDATE mp_student_data_export SET expires_at=UTC_TIMESTAMP(3) WHERE public_id=?",ready);assertEquals("EXPIRED",service.exportStatus(student,ready).status());assertEquals(404,failure(()->service.download(student,ready)).status);String body=mapper.writeValueAsString(listed);assertFalse(body.contains("object_key"));assertFalse(body.contains("file_sha256"));
    }
    @Test void receiptsStoreOnlyHashesAndIdempotentReissueRotatesCookieWithoutDuplicatingRequest()throws Exception{
        String key=key();var first=deletion(student,key);var second=deletion(student,key);assertEquals(first.status(),second.status());assertNotEquals(first.secret(),second.secret());
        var row=db.queryForMap("SELECT * FROM mp_account_deletion_request WHERE public_id=?",first.status().requestId());assertEquals(Secrets.hash(second.secret()),row.get("receipt_secret_hash"));assertFalse(row.values().contains(second.secret()));assertEquals(1L,count("SELECT COUNT(*) FROM mp_account_deletion_request WHERE student_id=?",student.internalId()));assertEquals("REQUESTED",service.receipt(second.status().receiptId(),second.secret()).status());assertEquals(404,failure(()->service.receipt(first.status().receiptId(),first.secret())).status);
        String durable=db.queryForObject("SELECT safe_response_json FROM mp_idempotency_record WHERE owner_student_id=?",String.class,student.internalId());assertFalse(durable.contains(first.secret()));assertFalse(durable.contains(second.secret()));assertFalse(durable.contains("secret"));
    }
    @Test void badPasswordLeavesSessionsTokensJobsAndExportsUntouchedAndDoesNotConsumeKey(){
        var request=deletion(student,key());String session=sessions.issue(student.internalId());token("RESET_PASSWORD");var exported=service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key());String confirmKey=key();assertEquals("CURRENT_PASSWORD_INVALID",failure(()->service.confirmDeletion(student,request.status().requestId(),new PrivacyDtos.DeletionConfirm("wrong"),confirmKey)).code);
        verify(limits).require("deletion-confirm",student.publicId(),5,Duration.ofMinutes(15));assertEquals("ACTIVE",accountStatus());assertEquals(student.publicId(),sessions.authenticate(session).publicId());assertEquals("REQUESTED",service.exportStatus(student,exported.exportId()).status());assertEquals(1L,count("SELECT COUNT(*) FROM mp_email_token WHERE student_id=? AND revoked_at IS NULL",student.internalId()));assertEquals(0L,count("SELECT COUNT(*) FROM mp_background_job WHERE owner_student_id=? AND status='CANCELLED'",student.internalId()));
        assertEquals("CONFIRMED",service.confirmDeletion(student,request.status().requestId(),new PrivacyDtos.DeletionConfirm(PASSWORD),confirmKey).status());
    }
    @Test void confirmationRevokesEverySessionTokenExportMemberAndRunningJobAtomically()throws Exception{
        var request=deletion(student,key());String one=sessions.issue(student.internalId()),two=sessions.issue(student.internalId());token("RESET_PASSWORD");token("VERIFY_EMAIL");String artifact=readyExport();service.requestExport(student,new PrivacyDtos.ExportRequest("FULL_PERSONAL_EXPORT"),key());long admin=memberExport();
        db.update("UPDATE mp_background_job SET status='RUNNING',lease_until=?,worker_id='synthetic-privacy',lease_version=7 WHERE owner_student_id=?",Timestamp.from(Instant.now().plusSeconds(60)),student.internalId());
        var confirmed=service.confirmDeletion(student,request.status().requestId(),new PrivacyDtos.DeletionConfirm(PASSWORD),key());assertEquals("CONFIRMED",confirmed.status());assertEquals("DELETION_PENDING",accountStatus());assertEquals(401,failure(()->sessions.authenticate(one)).status);assertEquals(401,failure(()->sessions.authenticate(two)).status);assertEquals(0L,count("SELECT COUNT(*) FROM mp_email_token WHERE student_id=? AND revoked_at IS NULL",student.internalId()));assertEquals(0L,count("SELECT COUNT(*) FROM mp_student_data_export WHERE student_id=? AND status<>'EXPIRED'",student.internalId()));assertEquals("REVOKED",db.queryForObject("SELECT status FROM mp_admin_export WHERE id=?",String.class,admin));assertEquals(0L,count("SELECT COUNT(*) FROM mp_background_job WHERE owner_student_id=? AND job_type<>'ACCOUNT_DELETE' AND (status<>'CANCELLED' OR lease_until IS NOT NULL OR lease_version<>8)",student.internalId()));assertEquals(1L,count("SELECT COUNT(*) FROM mp_background_job WHERE owner_student_id=? AND job_type='ACCOUNT_DELETE' AND status='PENDING'",student.internalId()));assertEquals(403,failure(()->service.download(student,artifact)).status);
        assertEquals("PROCESSING",service.receipt(request.status().receiptId(),request.secret()).status());assertTrue(confirmed.receiptExpiresAt().isAfter(Instant.now().plus(Duration.ofDays(119))));
        for(var row:db.queryForList("SELECT safe_response_json FROM mp_idempotency_record WHERE owner_student_id=?",student.internalId())){String json=Objects.toString(row.get("safe_response_json"));assertFalse(json.contains(PASSWORD));assertFalse(json.contains(request.secret()));}
    }
    @Test void lostConfirmationResponseRecoversViaPreissuedReceiptButNeverReopensStudentAccess(){
        var issued=deletion(student,key());String key=key();service.confirmDeletion(student,issued.status().requestId(),new PrivacyDtos.DeletionConfirm(PASSWORD),key); // intentionally discard the HTTP-like result
        assertEquals("PROCESSING",service.receipt(issued.status().receiptId(),issued.secret()).status());assertEquals(403,failure(()->service.confirmDeletion(student,issued.status().requestId(),new PrivacyDtos.DeletionConfirm(PASSWORD),key)).status);assertEquals(403,failure(()->service.exports(student)).status);assertEquals(404,failure(()->service.receipt(issued.status().receiptId(),"b".repeat(43))).status);
    }
    @Test void expiryAndOtherOwnerCannotConfirmAndExpiredSlotCanBeRecreated(){
        var issued=deletion(student,key());var other=account("ACTIVE");assertEquals(404,failure(()->service.confirmDeletion(other,issued.status().requestId(),new PrivacyDtos.DeletionConfirm(PASSWORD),key())).status);db.update("UPDATE mp_account_deletion_request SET receipt_expires_at=UTC_TIMESTAMP(3) WHERE public_id=?",issued.status().requestId());assertEquals(404,failure(()->service.receipt(issued.status().receiptId(),issued.secret())).status);assertEquals(404,failure(()->service.confirmDeletion(student,issued.status().requestId(),new PrivacyDtos.DeletionConfirm(PASSWORD),key())).status);var next=deletion(student,key());assertNotEquals(issued.status().requestId(),next.status().requestId());assertEquals("CANCELLED",db.queryForObject("SELECT status FROM mp_account_deletion_request WHERE public_id=?",String.class,issued.status().requestId()));
    }
    @Test void completedDetachedReceiptRemainsSafeAfterPhysicalAccountRemoval()throws Exception{
        var issued=deletion(student,key());db.update("DELETE FROM mp_idempotency_record WHERE owner_student_id=?",student.internalId());db.update("UPDATE mp_account_deletion_request SET status='COMPLETED',student_id=NULL,completed_at=UTC_TIMESTAMP(3),current_stage='COMPLETED' WHERE public_id=?",issued.status().requestId());db.update("DELETE FROM mp_student_account WHERE id=?",student.internalId());
        var receipt=service.receipt(issued.status().receiptId(),issued.secret());assertEquals("COMPLETED",receipt.status());String json=mapper.writeValueAsString(receipt);assertFalse(json.contains(student.publicId()));assertFalse(json.contains("@"));assertFalse(json.contains(issued.secret()));assertFalse(json.contains("currentStage"));assertEquals(401,failure(()->service.exports(student)).status);
    }
    @Test void lockedAndDeletionPendingAccountsCannotRequestReadOrReplayExports(){
        String key=key();var exported=service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key);for(String status:List.of("LOCKED","DELETION_PENDING")){db.update("UPDATE mp_student_account SET status=? WHERE id=?",status,student.internalId());assertEquals(403,failure(()->service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key)).status);assertEquals(403,failure(()->service.exportStatus(student,exported.exportId())).status);assertEquals(403,failure(()->service.requestDeletion(student,key())).status);}
    }
    private StudentPrincipal account(String state){String id=PublicIds.next(),email="p7-privacy-"+id.toLowerCase(Locale.ROOT)+"@example.invalid";db.update("INSERT INTO mp_student_account(public_id,email_normalized,email_display,password_hash,status,analytics_exclusion_code) VALUES(?,?,?,?,?,'TEST')",id,email,email,passwords.hash(PASSWORD),state);long internal=db.queryForObject("SELECT id FROM mp_student_account WHERE public_id=?",Long.class,id);students.add(internal);return new StudentPrincipal(internal,id,state);}
    private PrivacyDtos.IssuedDeletion deletion(StudentPrincipal owner,String key){var result=service.requestDeletion(owner,key);if(!deletionIds.contains(result.status().requestId()))deletionIds.add(result.status().requestId());return result;}
    private void token(String purpose){db.update("INSERT INTO mp_email_token(student_id,purpose,token_hash,expires_at) VALUES(?,?,?,?)",student.internalId(),purpose,Secrets.hash(Secrets.random()),Timestamp.from(Instant.now().plusSeconds(3600)));}
    private String readyExport(){String id=PublicIds.next();byte[] bytes={1,2,3};var stored=files.write("student/"+id+".zip",bytes);db.update("INSERT INTO mp_student_data_export(public_id,student_id,scope,status,object_key,file_sha256,file_size_bytes,completed_at,expires_at) VALUES(?,?,'REPORTS_ONLY','READY',?,?,?,UTC_TIMESTAMP(3),?)",id,student.internalId(),stored.key(),stored.sha256(),stored.size(),Timestamp.from(Instant.now().plusSeconds(3600)));return id;}
    private long memberExport(){String name="p7p-"+PublicIds.next().substring(14).toLowerCase(Locale.ROOT);db.update("INSERT INTO sys_user(user_name,nick_name,password,status,del_flag,create_by) VALUES(?,?,'not-a-login-hash','0','0','p7-privacy-test')",name,name);long operator=db.queryForObject("SELECT user_id FROM sys_user WHERE user_name=?",Long.class,name);operators.add(operator);String id=PublicIds.next();db.update("INSERT INTO mp_admin_export(public_id,operator_id,dataset,filters_json,fields_json,purpose) VALUES(?,?,'STUDENTS','{}','[\"alias\"]','Synthetic deletion membership fixture')",id,operator);long export=db.queryForObject("SELECT id FROM mp_admin_export WHERE public_id=?",Long.class,id);db.update("INSERT INTO mp_admin_export_student(export_id,student_id) VALUES(?,?)",export,student.internalId());return export;}
    private String attemptExport(){try{return service.requestExport(student,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),key()).status();}catch(ApiException e){return e.code;}}
    private String accountStatus(){return db.queryForObject("SELECT status FROM mp_student_account WHERE id=?",String.class,student.internalId());}
    private long count(String sql,Object...args){return db.queryForObject(sql,Long.class,args);}
    private static String key(){return UUID.randomUUID().toString();}
    private static ApiException failure(Runnable action){return assertThrows(ApiException.class,action::run);}
}
