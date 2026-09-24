package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.shared.ApiException;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class WorkbookCatalogTest {
    private final TaskContentRepository repository = new TaskContentRepository(new ObjectMapper());
    private TaskContent.Version version(String key) {
        var bundle = repository.get(key + "/1.0.0/manifest.json");
        var m = bundle.manifest();
        return new TaskContent.Version(1, m.path("taskVersionId").asText(), m.path("contentKind").asText(), m.path("majorCode").asText(null), m.path("demoKey").asText(null), "1.0.0", bundle.manifestSha256(), m);
    }
    @Test void allThreePublicWorkbooksArePinnedAndDefensivelyCopied() {
        var catalog = new WorkbookCatalog(new ObjectMapper(), repository);
        for (String key : List.of("ai-support", "ds-learning", "ba-learning")) {
            var version = version(key);
            var metadata = catalog.list(version).getFirst();
            var bytes = catalog.bytes(version, "materials");
            assertEquals(metadata.byteLength(), bytes.length);
            assertEquals(metadata.sha256(), TaskContentRepository.hash(bytes));
            assertEquals(WorkbookCatalog.MIME, metadata.mediaType());
            assertEquals(key.equals("ai-support") ? 24 : key.equals("ds-learning") ? 360 : 72, metadata.rowCount());
            bytes[0] = 0;
            assertEquals('P', catalog.bytes(version, "materials")[0]);
            assertThrows(ApiException.class, () -> catalog.bytes(version, "evaluation-private"));
            assertThrows(ApiException.class, () -> catalog.bytes(version, "../../.env.local"));
            var tampered = new TaskContent.Version(1, version.taskVersionId(), "MAJOR", version.majorCode(), null, "1.0.0", "0".repeat(64), version.manifest());
            assertThrows(ApiException.class, () -> catalog.list(tampered));
        }
        assertTrue(catalog.list(version("demo-table")).isEmpty());
        assertThrows(ApiException.class, () -> catalog.bytes(version("demo-table"), "materials"));
    }
    @Test void packageRejectsMacrosTraversalExternalReferencesHiddenDataAndExtraFormulas() throws Exception {
        var catalog = new WorkbookCatalog(new ObjectMapper(), repository);
        byte[] original = catalog.bytes(version("ai-support"), "materials");
        for (String name : List.of("xl/vbaProject.bin", "../secrets.xml", "xl/externalLinks/externalLink1.xml")) {
            assertThrows(ApiException.class, () -> WorkbookCatalog.validatePackage(rewrite(original, name, "<forbidden/>", null)));
        }
        assertThrows(ApiException.class, () -> WorkbookCatalog.validatePackage(rewrite(original, null, null, text -> text.replaceAll("<(x:)?sheet ", "<$1sheet state=\"hidden\" "))));
        assertThrows(ApiException.class, () -> WorkbookCatalog.validatePackage(rewrite(original, null, null, text -> text.replace("<Relationship Type=", "<Relationship TargetMode=\"External\" Type="))));
        assertThrows(ApiException.class, () -> WorkbookCatalog.validatePackage(rewrite(original, null, null, text -> text.replace("B7/B6", "WEBSERVICE(&quot;https://example.invalid&quot;)"))));
        assertThrows(ApiException.class, () -> WorkbookCatalog.validatePackage(new byte[]{1,2,3}));
    }
    private static byte[] rewrite(byte[] original, String extraName, String extraBody, java.util.function.UnaryOperator<String> mutation) throws IOException {
        var result = new ByteArrayOutputStream();
        try (var input = new ZipInputStream(new ByteArrayInputStream(original)); var output = new ZipOutputStream(result)) {
            for (var entry = input.getNextEntry(); entry != null; entry = input.getNextEntry()) {
                String body = new String(input.readAllBytes(), StandardCharsets.UTF_8);
                output.putNextEntry(new ZipEntry(entry.getName()));
                output.write((mutation == null ? body : mutation.apply(body)).getBytes(StandardCharsets.UTF_8));
                output.closeEntry();
            }
            if (extraName != null) { output.putNextEntry(new ZipEntry(extraName)); output.write(extraBody.getBytes(StandardCharsets.UTF_8)); output.closeEntry(); }
        }
        return result.toByteArray();
    }
}
