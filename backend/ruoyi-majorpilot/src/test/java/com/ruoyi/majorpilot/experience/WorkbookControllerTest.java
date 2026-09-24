package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.shared.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.support.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class WorkbookControllerTest {
    private final StudentPrincipal student = new StudentPrincipal(7, "01ARZ3NDEKTSV4RRFFQ69G5FAV", "ACTIVE");
    private final RunService runs = mock(RunService.class);
    private final RunStore store = mock(RunStore.class);
    private final TransactionTemplate transaction = mock(TransactionTemplate.class);
    private final TaskContentRepository repository = new TaskContentRepository(new ObjectMapper());
    private final WorkbookCatalog catalog = new WorkbookCatalog(new ObjectMapper(), repository);
    private WorkbookController controller() {
        when(runs.transactions()).thenReturn(transaction); when(runs.store()).thenReturn(store);
        when(transaction.execute(any())).thenAnswer(call -> ((TransactionCallback<?>) call.getArgument(0)).doInTransaction(new SimpleTransactionStatus()));
        return new WorkbookController(runs, catalog);
    }
    private MockHttpServletRequest request() { var request = new MockHttpServletRequest(); request.setAttribute("mp.student", student); return request; }
    @Test void unauthorizedAndNonOwnerNeverReadAFile() {
        var controller = controller();
        assertEquals(401, assertThrows(ApiException.class, () -> controller.download("run", "materials", new MockHttpServletRequest())).status);
        when(store.owned(student, "other-run")).thenThrow(new ApiException(404, "RESOURCE_NOT_FOUND"));
        assertEquals(404, assertThrows(ApiException.class, () -> controller.download("other-run", "materials", request())).status);
        verify(runs, never()).version(any());
    }
    @Test void accountLifecyclePrecedesOwnershipAndContentLookup() {
        var controller = controller();
        doThrow(new ApiException(403, "ACCOUNT_LOCKED")).when(store).activeStudent(student);
        assertThrows(ApiException.class, () -> controller.list("run", request()));
        verify(store, never()).owned(any(), any());
    }
    @Test void versionBoundDownloadHasPrivateCacheUtf8DispositionLengthAndNoMutation() {
        var controller = controller(); var bundle = repository.get("ds-learning/1.0.0/manifest.json");
        var m = bundle.manifest();
        var version = new TaskContent.Version(1, m.path("taskVersionId").asText(), "MAJOR", "DATA_SCIENCE", null, "1.0.0", bundle.manifestSha256(), m);
        when(runs.version(null)).thenReturn(version);
        var response = (ResponseEntity<?>) controller.download("run", "materials", request());
        assertEquals(200, response.getStatusCode().value());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertTrue(response.getHeaders().getFirst("Content-Disposition").contains("filename*=UTF-8''"));
        assertEquals("nosniff", response.getHeaders().getFirst("X-Content-Type-Options"));
        assertEquals(((byte[]) response.getBody()).length, response.getHeaders().getContentLength());
        assertEquals(catalog.list(version).getFirst().sha256(), response.getHeaders().getFirst("X-Content-SHA256"));
        verify(store).activeStudent(student); verify(store).owned(student, "run");
        verifyNoMoreInteractions(store);
        assertThrows(ApiException.class, () -> controller.download("run", "golden-private", request()));
    }
}
