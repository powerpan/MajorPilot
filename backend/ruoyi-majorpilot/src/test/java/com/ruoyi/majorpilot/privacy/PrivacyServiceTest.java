package com.ruoyi.majorpilot.privacy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.ruoyi.majorpilot.auth.StudentPasswords;
import com.ruoyi.majorpilot.auth.StudentSessions;
import com.ruoyi.majorpilot.security.RateLimits;
import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.*;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.*;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Actual service/controller methods with no database, file IO, mail or HTTP server. */
class PrivacyServiceTest {
    private static final String ID="01JTEST0000000000000000001",RECEIPT="01JTEST0000000000000000002",KEY="synthetic-idempotency-key";
    private static final StudentPrincipal STUDENT=new StudentPrincipal(42,ID,"ACTIVE");
    private final ObjectMapper mapper=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final JdbcTemplate db=mock(JdbcTemplate.class);
    private final IdempotencyService idem=mock(IdempotencyService.class);
    private final RateLimits limits=mock(RateLimits.class);
    private final StudentPasswords passwords=mock(StudentPasswords.class);
    private final StudentSessions sessions=mock(StudentSessions.class);
    private final PrivateObjectStore files=mock(PrivateObjectStore.class);
    private final PrivacyStore store=spy(new PrivacyStore(db,new TransactionTemplate(new PureTransactions()),mapper));
    private final PrivacyService service=new PrivacyService(store,idem,limits,passwords,sessions,files);
    private final Instant now=Instant.now();

    @BeforeEach void setup(){
        doReturn(Map.of("id",42L,"status","ACTIVE","password_hash","synthetic-hash")).when(store).account(42,false);
        when(idem.execute(any(),anyString(),anyString(),anyString(),any(),any(),any())).thenAnswer(call->new IdempotencyService.Result<>(((Supplier<?>)call.getArgument(6)).get(),false));
    }
    private Map<String,Object> row(String state){
        var row=new HashMap<String,Object>();row.put("id",7L);row.put("public_id",ID);row.put("student_id",42L);row.put("receipt_id",RECEIPT);row.put("status",state);row.put("scope","REPORTS_ONLY");row.put("format","ZIP_JSON_HTML");row.put("requested_at",Timestamp.from(now));row.put("receipt_expires_at",Timestamp.from(now.plusSeconds(3600)));return row;
    }
    private ApiException failure(String code,Runnable call){var error=assertThrows(ApiException.class,call::run);assertEquals(code,error.code);return error;}
    private MockHttpServletRequest request(){var req=new MockHttpServletRequest();req.setAttribute("mp.student",STUDENT);return req;}
    private String json(Object value)throws Exception{return mapper.writeValueAsString(value);}

    @Test void scopeValidationRejectsMissingUnknownAndArbitraryScopeBeforeRateLimit(){
        for(var input:Arrays.asList(null,new PrivacyDtos.ExportRequest(null),new PrivacyDtos.ExportRequest("ALL_SQL")))failure("EXPORT_SCOPE_INVALID",()->service.requestExport(STUDENT,input,KEY));
        verifyNoInteractions(limits,idem,files);
    }
    @Test void bothExportScopesPassUnchangedIntoIdempotencyAndEnqueueOnlyTheOwnedTarget(){
        when(db.queryForObject(startsWith("SELECT COUNT(*) FROM mp_student_data_export"),eq(Integer.class),eq(42L))).thenReturn(0);
        for(String scope:List.of("REPORTS_ONLY","FULL_PERSONAL_EXPORT")){
            var row=row("REQUESTED");row.put("scope",scope);doReturn(row).when(store).export(eq(42L),anyString());
            var input=new PrivacyDtos.ExportRequest(scope);assertEquals(scope,service.requestExport(STUDENT,input,KEY+scope).scope());
            verify(idem).execute(eq(new IdempotencyService.Owner(42L,null,"student:42")),eq("POST"),eq("/api/app/v1/data-export-requests"),eq(KEY+scope),eq(input),eq(PrivacyDtos.ExportStatus.class),any());
        }
        verify(store,times(2)).enqueue(eq("STUDENT_EXPORT"),startsWith("student-export:"),eq(42L),eq("STUDENT_DATA_EXPORT"),eq(7L));verifyNoInteractions(files);
    }
    @Test void twoPendingExportsRejectAThirdBeforeInsertingOrEnqueueing(){
        when(db.queryForObject(startsWith("SELECT COUNT(*) FROM mp_student_data_export"),eq(Integer.class),eq(42L))).thenReturn(2);
        assertEquals(409,failure("EXPORT_IN_PROGRESS",()->service.requestExport(STUDENT,new PrivacyDtos.ExportRequest("REPORTS_ONLY"),KEY)).status);
        verify(db,never()).update(startsWith("INSERT INTO mp_student_data_export"),any(),any(),any());verify(store,never()).enqueue(anyString(),anyString(),anyLong(),anyString(),anyLong());
    }
    @Test void downloadRequiresReadyUnexpiredOwnedArtifactAndChecksLengthAndHash(){
        byte[] bytes={1,2,3};var row=row("READY");row.put("expires_at",Timestamp.from(now.plusSeconds(3600)));row.put("object_key","student/"+ID+".zip");row.put("file_size_bytes",3L);row.put("file_sha256",PrivacyService.sha(bytes));doReturn(row).when(store).export(42,ID);when(files.read("student/"+ID+".zip")).thenReturn(bytes);
        assertArrayEquals(bytes,service.download(STUDENT,ID));
        row.put("file_sha256","0".repeat(64));failure("EXPORT_FILE_UNAVAILABLE",()->service.download(STUDENT,ID));
        row.put("file_sha256",PrivacyService.sha(bytes));row.put("file_size_bytes",4L);failure("EXPORT_FILE_UNAVAILABLE",()->service.download(STUDENT,ID));
        row.put("expires_at",Timestamp.from(now.minusSeconds(1)));failure("RESOURCE_NOT_FOUND",()->service.download(STUDENT,ID));
        row.put("expires_at",Timestamp.from(now.plusSeconds(3600)));row.put("status","REQUESTED");failure("RESOURCE_NOT_FOUND",()->service.download(STUDENT,ID));
        verify(files,times(3)).read(anyString());
    }
    @Test void wrongCurrentPasswordIsRejectedAfterIndependentRateLimitWithoutAnyRevocation(){
        failure("CURRENT_PASSWORD_INVALID",()->service.confirmDeletion(STUDENT,ID,new PrivacyDtos.DeletionConfirm("synthetic wrong password"),KEY));
        verify(limits).require("deletion-confirm",ID,5,Duration.ofMinutes(15));verifyNoInteractions(sessions,files);verify(db,never()).update(anyString(),any(Object[].class));verify(store,never()).deletion(anyLong(),anyString());
    }
    @Test void confirmationRejectsExpiredRequestEvenWithCorrectPassword(){
        when(passwords.matches("synthetic password","synthetic-hash")).thenReturn(true);var row=row("REQUESTED");row.put("receipt_expires_at",Timestamp.from(now.minusSeconds(1)));doReturn(row).when(store).deletion(42,ID);
        failure("RESOURCE_NOT_FOUND",()->service.confirmDeletion(STUDENT,ID,new PrivacyDtos.DeletionConfirm("synthetic password"),KEY));verifyNoInteractions(sessions,files);
    }
    @Test void receiptRejectsWrongOrExpiredSecretWithSameSafe404AndNeverReadsAccount(){
        String secret="a".repeat(43);var row=row("REQUESTED");row.put("receipt_secret_hash",Secrets.hash(secret));when(db.queryForList(startsWith("SELECT status,requested_at"),eq(RECEIPT))).thenReturn(List.of(row));
        assertEquals("REQUESTED",service.receipt(RECEIPT,secret).status());
        for(String invalid:Arrays.asList(null,"",secret+"a","b".repeat(43)))assertEquals(404,failure("RESOURCE_NOT_FOUND",()->service.receipt(RECEIPT,invalid)).status);
        row.put("receipt_expires_at",Timestamp.from(now.minusSeconds(1)));failure("RESOURCE_NOT_FOUND",()->service.receipt(RECEIPT,secret));
        row.put("receipt_expires_at",Timestamp.from(now.plusSeconds(3600)));row.put("status","CANCELLED");failure("RESOURCE_NOT_FOUND",()->service.receipt(RECEIPT,secret));verify(store,never()).account(anyLong(),anyBoolean());
    }
    @Test void receiptProjectionAfterDeletionHasOnlySafeTimesAndPublicState()throws Exception{
        String secret="a".repeat(43);var row=row("COMPLETED");row.put("receipt_secret_hash",Secrets.hash(secret));row.put("completed_at",Timestamp.from(now));row.put("email","sensitive@example.invalid");row.put("failure_code","INTERNAL_DETAIL");row.put("current_stage","PRIVATE_STAGE");when(db.queryForList(startsWith("SELECT status,requested_at"),eq(RECEIPT))).thenReturn(List.of(row));
        var result=mapper.valueToTree(service.receipt(RECEIPT,secret));assertEquals(Set.of("status","requestedAt","confirmedAt","scheduledFor","completedAt","expiresAt"),properties(result));String output=json(result);assertFalse(output.contains(secret));assertFalse(output.contains("sensitive"));assertFalse(output.contains("PRIVATE_STAGE"));assertFalse(output.contains(ID));
        row.put("status","CONFIRMED");row.put("confirmed_at",Timestamp.from(now.minus(Duration.ofDays(31))));assertEquals("ACTION_REQUIRED",service.receipt(RECEIPT,secret).status());row.put("confirmed_at",Timestamp.from(now));assertEquals("PROCESSING",service.receipt(RECEIPT,secret).status());
    }
    @Test void controllerPresetsHostOnlyReadOnlyReceiptCookieBeforeConfirmationAndNeverSerializesSecret()throws Exception{
        var mocked=mock(PrivacyService.class);var controller=new PrivacyController(mocked);String secret="a".repeat(43);var status=PrivacyStore.deletionStatus(row("REQUESTED"));when(mocked.requestDeletion(STUDENT,KEY)).thenReturn(new PrivacyDtos.IssuedDeletion(status,secret));var response=new MockHttpServletResponse();
        var result=(ResponseEntity<?>)controller.deletion(Map.of(),KEY,request(),response);assertEquals(201,result.getStatusCode().value());String cookie=response.getHeader("Set-Cookie");assertNotNull(cookie);assertTrue(cookie.startsWith("MP_DELETION="+secret+";"));assertTrue(cookie.contains("Path=/api/public/v1/deletion-receipts"));assertTrue(cookie.contains("HttpOnly"));assertTrue(cookie.contains("SameSite=Lax"));assertTrue(cookie.contains("Max-Age=10972800"));assertFalse(cookie.contains("Domain="));assertFalse(json(result.getBody()).contains(secret));assertFalse(json(result.getBody()).contains("receiptSecret"));verify(mocked,never()).confirmDeletion(any(),anyString(),any(),anyString());
        failure("VALIDATION_ERROR",()->controller.deletion(Map.of("secret","forged"),KEY,request(),new MockHttpServletResponse()));
    }
    @Test void controllerConfirmsThenClearsBothStudentCookiesButLeavesPreissuedReceiptUsable()throws Exception{
        var mocked=mock(PrivacyService.class);var controller=new PrivacyController(mocked);var body=new PrivacyDtos.DeletionConfirm("synthetic password");when(mocked.confirmDeletion(STUDENT,ID,body,KEY)).thenReturn(PrivacyStore.deletionStatus(row("CONFIRMED")));var response=new MockHttpServletResponse();var result=(ResponseEntity<?>)controller.confirm(ID,body,KEY,request(),response);
        assertEquals(202,result.getStatusCode().value());var cookies=response.getHeaders("Set-Cookie");assertEquals(2,cookies.size());assertTrue(cookies.stream().allMatch(value->value.contains("Max-Age=0")));assertTrue(cookies.stream().noneMatch(value->value.startsWith("MP_DELETION=")));assertFalse(json(result.getBody()).contains("synthetic password"));
    }
    @Test void receiptControllerUsesOnlyReceiptCookieTightensExpiryAndClearsOnlyInvalidReceipt(){
        var mocked=mock(PrivacyService.class);var controller=new PrivacyController(mocked);String secret="a".repeat(43);var req=request();req.setCookies(new Cookie("MP_SESSION","not-a-receipt"),new Cookie("MP_DELETION",secret));var receipt=new PrivacyDtos.Receipt("PROCESSING",now,now,now,null,Instant.now().plusSeconds(600));when(mocked.receipt(RECEIPT,secret)).thenReturn(receipt);var response=new MockHttpServletResponse();assertNotNull(controller.receipt(RECEIPT,req,response));assertTrue(response.getHeader("Set-Cookie").contains("Path=/api/public/v1/deletion-receipts"));
        doThrow(new ApiException(404,"RESOURCE_NOT_FOUND")).when(mocked).receipt(RECEIPT,secret);var invalid=new MockHttpServletResponse();failure("RESOURCE_NOT_FOUND",()->controller.receipt(RECEIPT,req,invalid));assertTrue(invalid.getHeader("Set-Cookie").contains("Max-Age=0"));
        doThrow(new ApiException(403,"CSRF_INVALID")).when(mocked).receipt(RECEIPT,secret);var forbidden=new MockHttpServletResponse();assertEquals(403,failure("CSRF_INVALID",()->controller.receipt(RECEIPT,req,forbidden)).status);assertNull(forbidden.getHeader("Set-Cookie"));
    }
    @Test void listControllerUsesItemsWrapperAndDownloadReturnsOnlyPrivateZipBytes()throws Exception{
        var mocked=mock(PrivacyService.class);var controller=new PrivacyController(mocked);when(mocked.exports(STUDENT)).thenReturn(List.of(PrivacyStore.exportStatus(row("REQUESTED"),now)));var list=mapper.valueToTree(controller.exports(request()));assertTrue(list.path("data").path("items").isArray());assertFalse(list.path("data").has("rows"));byte[] bytes={1,2,3};when(mocked.download(STUDENT,ID)).thenReturn(bytes);var result=controller.download(ID,request());assertArrayEquals(bytes,result.getBody());assertEquals("application/zip",result.getHeaders().getContentType().toString());assertEquals("no-store",result.getHeaders().getCacheControl());assertEquals("nosniff",result.getHeaders().getFirst("X-Content-Type-Options"));
    }
    private static Set<String> properties(com.fasterxml.jackson.databind.JsonNode node){var names=new HashSet<String>();node.fieldNames().forEachRemaining(names::add);return names;}
    private static final class PureTransactions extends AbstractPlatformTransactionManager {
        @Override protected Object doGetTransaction(){return new Object();}
        @Override protected void doBegin(Object transaction,TransactionDefinition definition){}
        @Override protected void doCommit(DefaultTransactionStatus status){}
        @Override protected void doRollback(DefaultTransactionStatus status){}
    }
}
