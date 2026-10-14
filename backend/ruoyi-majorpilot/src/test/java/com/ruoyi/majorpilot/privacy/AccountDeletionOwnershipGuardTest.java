package com.ruoyi.majorpilot.privacy;

import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AccountDeletionOwnershipGuardTest {
    @Test void adoptionIsOwnedByStudentAndChecksBothRunAndProfileEdgesWhileTaskReleaseStaysGlobal(){
        assertTrue(AccountDeletionOwnershipGuard.registeredTables().contains("mp_run_product_adoption"));
        assertFalse(AccountDeletionOwnershipGuard.registeredTables().contains("mp_local_task_release"));
        var edges=AccountDeletionOwnershipGuard.registeredEdges();
        assertTrue(edges.contains(new AccountDeletionOwnershipGuard.Edge("mp_run_product_adoption","student_id","mp_student_account","id")));
        assertTrue(edges.contains(new AccountDeletionOwnershipGuard.Edge("mp_run_product_adoption","experience_run_id","mp_experience_run","id")));
        assertTrue(edges.contains(new AccountDeletionOwnershipGuard.Edge("mp_run_product_adoption","decision_profile_id","mp_decision_profile","id")));
        assertEquals(5,edges.stream().filter(e->e.child().equals("mp_run_product_adoption")).count());
    }
    final JdbcTemplate db=mock(JdbcTemplate.class);
    @AfterEach void clear(){TransactionSynchronizationManager.setActualTransactionActive(false);}
    static List<Map<String,Object>> schema(){var rows=new ArrayList<Map<String,Object>>();int n=0;for(var edge:AccountDeletionOwnershipGuard.registeredEdges())rows.add(new LinkedHashMap<>(Map.of("child_table",edge.child(),"child_column",edge.column(),"parent_table",edge.parent(),"parent_column",edge.parentColumn(),"constraint_name","constraint_"+(++n),"ordinal_position",1,"same_schema",1)));return rows;}
    static void invalid(org.junit.jupiter.api.function.Executable body){ApiException error=assertThrows(ApiException.class,body);assertEquals(503,error.status);assertEquals("DELETION_SOURCE_INVALID",error.code);}

    @Test void everyOwnedTableAndKnownFkHasAnExplicitClosedMapping(){
        var tables=AccountDeletionOwnershipGuard.registeredTables();assertTrue(tables.containsAll(Set.of("mp_admin_export_student","mp_account_deletion_request","mp_idempotency_record","mp_report_claim_evidence","mp_response_execution","mp_comparison_source","mp_sensitive_audit")));
        assertTrue(tables.size()>=30);for(String table:tables){String query=AccountDeletionOwnershipGuard.projection(table);assertTrue(query.startsWith("SELECT "));assertTrue(query.contains("deletion_owner"));assertFalse(query.contains("null)"));}
        for(var edge:AccountDeletionOwnershipGuard.registeredEdges()){assertTrue(tables.contains(edge.child())||edge.child().equals("mp_admin_export"));assertTrue(tables.contains(edge.parent())||Set.of("mp_major","mp_task_version","sys_user","mp_admin_export").contains(edge.parent()));}
        AccountDeletionOwnershipGuard.validateSchema(schema());
    }
    @Test void registryExactlyMatchesAllOwnedForeignKeysInTheFrozenMigrationResources()throws Exception{
        var tablePattern=Pattern.compile("(?:CREATE\\s+TABLE|ALTER\\s+TABLE)\\s+(\\w+)",Pattern.CASE_INSENSITIVE);
        var foreignPattern=Pattern.compile("FOREIGN\\s+KEY\\s*\\(\\s*(\\w+)\\s*\\)\\s+REFERENCES\\s+(\\w+)\\s*\\(\\s*(\\w+)\\s*\\)",Pattern.CASE_INSENSITIVE);
        var expected=new HashSet<AccountDeletionOwnershipGuard.Edge>();var owned=AccountDeletionOwnershipGuard.registeredTables();
        for(String file:List.of("V3__p1_identity_intake_recommendation.sql","V4__content_and_experience_engine.sql","V5__step_completion_history.sql","V6__professional_preview_and_evidence_pipeline.sql","V7__reports_versions_jobs_feedback.sql","V8__operations_privacy_and_retention.sql","V9__local_product_authorizations.sql","V13__invitation_pilot_and_report_allowances.sql")){
            try(var resource=getClass().getResourceAsStream("/db/migration/"+file)){assertNotNull(resource);String sql=new String(resource.readAllBytes(),StandardCharsets.UTF_8).replaceAll("(?m)--[^\\r\\n]*","");for(String statement:sql.split(";")){var table=tablePattern.matcher(statement);if(!table.find())continue;String child=table.group(1);var edge=foreignPattern.matcher(statement);while(edge.find()){String parent=edge.group(2);if(owned.contains(child)||owned.contains(parent)||child.equals("mp_admin_export")||parent.equals("mp_admin_export"))expected.add(new AccountDeletionOwnershipGuard.Edge(child,edge.group(1),parent,edge.group(3)));}}}
        }
        assertEquals(expected,AccountDeletionOwnershipGuard.registeredEdges());
    }
    @Test void unknownIncomingOutgoingMissingCompositeAndCrossSchemaReferencesFailClosed(){
        var added=schema();added.add(new LinkedHashMap<>(Map.of("child_table","future_data","child_column","student_id","parent_table","mp_student_account","parent_column","id","constraint_name","new_fk","ordinal_position",1,"same_schema",1)));invalid(()->AccountDeletionOwnershipGuard.validateSchema(added));
        var outgoing=schema();outgoing.add(new LinkedHashMap<>(Map.of("child_table","mp_report","child_column","future_id","parent_table","future_data","parent_column","id","constraint_name","future_fk","ordinal_position",1,"same_schema",1)));invalid(()->AccountDeletionOwnershipGuard.validateSchema(outgoing));
        var missing=schema();missing.removeFirst();invalid(()->AccountDeletionOwnershipGuard.validateSchema(missing));
        var composite=schema();composite.getFirst().put("ordinal_position",2);invalid(()->AccountDeletionOwnershipGuard.validateSchema(composite));
        var external=schema();external.getFirst().put("same_schema",0);invalid(()->AccountDeletionOwnershipGuard.validateSchema(external));
        var duplicate=schema();duplicate.add(new LinkedHashMap<>(duplicate.getFirst()));invalid(()->AccountDeletionOwnershipGuard.validateSchema(duplicate));
    }
    @Test void unrelatedRuoYiForeignKeysDoNotExpandTheStudentTree(){var rows=schema();rows.add(Map.of("child_table","sys_role_menu","parent_table","sys_role"));assertDoesNotThrow(()->AccountDeletionOwnershipGuard.validateSchema(rows));}
    @Test void cyclesAndMissingParentsRejectWithoutRecursionOrArbitraryHistoryLimit(){
        var chain=new HashMap<Long,Long>();chain.put(1L,null);for(long n=2;n<=20000;n++)chain.put(n,n-1);assertDoesNotThrow(()->AccountDeletionOwnershipGuard.assertAcyclic(chain));chain.put(1L,20000L);invalid(()->AccountDeletionOwnershipGuard.assertAcyclic(chain));
        invalid(()->AccountDeletionOwnershipGuard.assertAcyclic(Map.of(1L,1L)));invalid(()->AccountDeletionOwnershipGuard.assertAcyclic(Map.of(1L,2L)));invalid(()->AccountDeletionOwnershipGuard.assertAcyclic(Map.of(1L,2L,2L,1L)));
    }
    @Test void requiresTransactionAndDeletionPendingAccountBeforeReadingTheGraph(){var guard=new AccountDeletionOwnershipGuard(db);invalid(()->guard.validate(7));verifyNoInteractions(db);TransactionSynchronizationManager.setActualTransactionActive(true);when(db.queryForList(anyString(),eq(7L))).thenReturn(List.of(Map.of("status","ACTIVE")));invalid(()->guard.validate(7));verify(db,times(1)).queryForList(anyString(),eq(7L));}
    @Test void actualGuardUsesOnlyReadQueriesAndChecksBothEdgeDirections(){
        TransactionSynchronizationManager.setActualTransactionActive(true);when(db.queryForList(anyString())).thenReturn(schema());when(db.queryForList(startsWith("SELECT status FROM mp_student_account"),eq(7L))).thenReturn(List.of(Map.of("status","DELETION_PENDING")));
        assertDoesNotThrow(()->new AccountDeletionOwnershipGuard(db).validate(7));
        for(var invocation:mockingDetails(db).getInvocations()){assertEquals("queryForList",invocation.getMethod().getName());assertTrue(((String)invocation.getArgument(0)).startsWith("SELECT "));}
        assertTrue(mockingDetails(db).getInvocations().stream().map(i->(String)i.getArgument(0)).anyMatch(sql->sql.contains("(c.deletion_owner=? OR p.deletion_owner=?) AND NOT(c.deletion_owner <=> p.deletion_owner)")));
        assertTrue(mockingDetails(db).getInvocations().stream().map(i->(String)i.getArgument(0)).anyMatch(sql->sql.contains("c.source_type=? AND p.id IS NOT NULL AND (c.deletion_owner=? OR p.deletion_owner=?)")));
    }
}
