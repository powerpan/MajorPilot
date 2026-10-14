package com.ruoyi.majorpilot.experience;

import com.ruoyi.majorpilot.content.WorkbookCatalog;
import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Profile;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @Profile({"local","pilot"})
@RequestMapping("/api/app/v1/experience-runs/{id}/workbooks")
public class WorkbookController {
    private final RunService runs;
    private final WorkbookCatalog workbooks;
    public WorkbookController(RunService runs, WorkbookCatalog workbooks) { this.runs = runs; this.workbooks = workbooks; }

    @GetMapping Object list(@PathVariable String id, HttpServletRequest request) {
        var student = ApiResponses.student(request);
        return runs.transactions().execute(status -> {
            runs.store().activeStudent(student);
            var version = runs.version(runs.store().owned(student, id));
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponses.success(request, workbooks.list(version)));
        });
    }

    @GetMapping("/{assetKey}") Object download(@PathVariable String id, @PathVariable String assetKey, HttpServletRequest request) {
        var student = ApiResponses.student(request);
        return runs.transactions().execute(status -> {
            runs.store().activeStudent(student);
            var version = runs.version(runs.store().owned(student, id));
            byte[] bytes = workbooks.bytes(version, assetKey);
            var metadata = workbooks.list(version).getFirst();
            return ResponseEntity.ok().contentType(MediaType.parseMediaType(WorkbookCatalog.MIME))
                .contentLength(bytes.length).cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(metadata.filename(), StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff").header("X-Content-SHA256", metadata.sha256()).body(bytes);
        });
    }
}
