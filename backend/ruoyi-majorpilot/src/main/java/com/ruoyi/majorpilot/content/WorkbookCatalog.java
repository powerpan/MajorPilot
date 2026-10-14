package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.shared.ApiException;
import java.io.*;
import java.util.*;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Version-bound, public-only derived assets. Does not modify historical task manifests. */
@Component @Profile({"local","pilot"})
public final class WorkbookCatalog {
    public static final String MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    public record Metadata(String assetKey, String filename, String workbookVersion, String mediaType,
                           int byteLength, int rowCount, String sha256, String taskVersionId) {}
    private record Entry(Metadata metadata, String manifestSha256, byte[] bytes) {}
    private final Map<String, Entry> entries;

    public WorkbookCatalog(ObjectMapper mapper, TaskContentRepository repository) {
        Map<String, Entry> loaded = new HashMap<>();
        try {
            JsonNode catalog = mapper.readTree(resource("workbooks/catalog.json", 65536));
            check(catalog.path("schemaVersion").asText().equals("workbook-catalog-v1"));
            check(catalog.path("workbooks").isArray() && catalog.path("workbooks").size() <= 30);
            for (JsonNode item : catalog.path("workbooks")) {
                String id = item.path("taskVersionId").asText();
                var bundle = repository.bundles().stream().filter(b -> b.manifest().path("taskVersionId").asText().equals(id)).findFirst().orElseThrow(TaskContentRepository::integrity);
                check(bundle.manifestSha256().equals(item.path("manifestSha256").asText()));
                check(item.path("sources").isArray() && !item.path("sources").isEmpty());
                Set<String> sourceKeys = new HashSet<>();
                for (JsonNode source : item.path("sources")) {
                    String key = source.path("assetKey").asText();
                    check(sourceKeys.add(key));
                    byte[] raw = repository.asset(bundle, key, true); // private source keys fail closed
                    check(TaskContentRepository.hash(raw).equals(source.path("sha256").asText()));
                }
                String assetKey = item.path("assetKey").asText(), filename = item.path("filename").asText();
                check(assetKey.equals("materials") && filename.matches("[\\p{L}\\p{N} ._-]{1,100}\\.xlsx"));
                check(item.path("mediaType").asText().equals(MIME));
                check(item.path("workbookVersion").asText().matches("[0-9]+\\.[0-9]+\\.[0-9]+"));
                String path = item.path("path").asText();
                check(path.matches("workbooks/[0-9.]+/[a-z-]+\\.xlsx"));
                byte[] bytes = resource(path, MAX_BYTES);
                check(bytes.length == item.path("byteLength").asInt() && TaskContentRepository.hash(bytes).equals(item.path("sha256").asText()));
                check(item.path("rowCount").isIntegralNumber() && item.path("rowCount").asInt() > 0);
                validatePackage(bytes);
                Metadata metadata = new Metadata(assetKey, filename, item.path("workbookVersion").asText(), MIME,
                    bytes.length, item.path("rowCount").asInt(), item.path("sha256").asText(), id);
                check(loaded.put(id, new Entry(metadata, bundle.manifestSha256(), bytes)) == null);
            }
        } catch (ApiException error) { throw error; }
        catch (Exception error) { throw TaskContentRepository.integrity(); }
        entries = Map.copyOf(loaded);
    }

    public List<Metadata> list(TaskContent.Version version) {
        Entry entry = entries.get(version.taskVersionId());
        if (entry == null) return List.of();
        check(entry.manifestSha256.equals(version.manifestSha256()));
        return List.of(entry.metadata);
    }

    public byte[] bytes(TaskContent.Version version, String assetKey) {
        List<Metadata> metadata = list(version);
        if (metadata.isEmpty() || !metadata.getFirst().assetKey().equals(assetKey)) throw new ApiException(404, "CONTENT_UNAVAILABLE");
        return entries.get(version.taskVersionId()).bytes.clone();
    }

    static void validatePackage(byte[] bytes) {
        // Bounded ZIP and XML parsing. No macros, hidden sheets, remote relationships or arbitrary formulas.
        try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            var parser = factory.newDocumentBuilder();
            Set<String> names = new HashSet<>();
            int expanded = 0;
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                String name = entry.getName();
                check(names.add(name) && names.size() <= 30 && !entry.isDirectory());
                check(name.matches("\\[Content_Types\\]\\.xml|_rels/\\.rels|xl/(workbook\\.xml|styles\\.xml|sharedStrings\\.xml|theme/theme1\\.xml|_rels/workbook\\.xml\\.rels|worksheets/sheet[123]\\.xml|worksheets/_rels/sheet2\\.xml\\.rels|tables/table1\\.xml)"));
                byte[] xml = zip.readNBytes(MAX_BYTES + 1);
                expanded += xml.length;
                check(xml.length <= MAX_BYTES && expanded <= 20 * 1024 * 1024);
                var document = parser.parse(new ByteArrayInputStream(xml));
                var elements = document.getElementsByTagName("*");
                for (int i = 0; i < elements.getLength(); i++) {
                    var element = (org.w3c.dom.Element) elements.item(i);
                    check(!element.getAttribute("TargetMode").equalsIgnoreCase("External"));
                    check(!Set.of("hidden", "veryHidden").contains(element.getAttribute("state")));
                    check(!element.getAttribute("hidden").equals("1"));
                    String target = element.getAttribute("Target");
                    check(!target.contains(":") && !target.contains("\\") && !target.contains(".."));
                    if (element.getLocalName().equals("f")) {
                        check(name.equals("xl/worksheets/sheet1.xml"));
                        check(element.getTextContent().equals("IF(B6=0,\"无法计算\",B7/B6)"));
                    }
                }
            }
            check(names.containsAll(Set.of("[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml")));
        } catch (ApiException error) { throw error; }
        catch (Exception error) { throw TaskContentRepository.integrity(); }
    }

    private static byte[] resource(String path, int limit) {
        TaskManifestValidator.safePath(path);
        try (InputStream input = WorkbookCatalog.class.getClassLoader().getResourceAsStream("task-content/" + path)) {
            check(input != null);
            byte[] bytes = input.readNBytes(limit + 1);
            check(bytes.length > 0 && bytes.length <= limit);
            return bytes;
        } catch (ApiException error) { throw error; }
        catch (IOException error) { throw TaskContentRepository.integrity(); }
    }
    private static void check(boolean condition) { if (!condition) throw TaskContentRepository.integrity(); }
}
