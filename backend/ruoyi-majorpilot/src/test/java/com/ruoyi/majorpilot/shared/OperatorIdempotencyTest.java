package com.ruoyi.majorpilot.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OperatorIdempotencyTest {
    @Test void lockedIsAllowedOnlyThroughTheExplicitOperatorEntryPoint(){for(String status:List.of("ACTIVE","PENDING_VERIFICATION")){assertTrue(IdempotencyService.studentAllowed(status,false));assertTrue(IdempotencyService.studentAllowed(status,true));}assertFalse(IdempotencyService.studentAllowed("LOCKED",false));assertTrue(IdempotencyService.studentAllowed("LOCKED",true));for(String status:List.of("DELETION_PENDING","DELETED","UNKNOWN")){assertFalse(IdempotencyService.studentAllowed(status,false));assertFalse(IdempotencyService.studentAllowed(status,true));}}
    @Test void operatorActionsRequireRealStudentOwnershipAndCannotUseAnonymousOrIntakeScope(){var db=mock(JdbcTemplate.class);var tx=mock(TransactionTemplate.class);var service=new IdempotencyService(db,tx,new Secrets("synthetic-operator-secret-".repeat(3)),new ObjectMapper());for(var owner:List.of(new IdempotencyService.Owner(null,null,"operator:1"),new IdempotencyService.Owner(null,1L,"operator:1"),new IdempotencyService.Owner(1L,1L,"operator:1")))assertEquals(422,assertThrows(ApiException.class,()->service.executeOperatorScoped(owner,"PATCH","/synthetic","synthetic-key-12345",null,String.class,()->"must-not-run")).status);verifyNoInteractions(db,tx);}
}
