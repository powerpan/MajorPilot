package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.*;
import com.ruoyi.majorpilot.shared.ApiException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Loads only catalogued classpath resources; neither HTTP nor client-supplied filesystem paths are supported. */
@Component @Profile("local")
public final class TaskContentRepository {
    public record Bundle(String path,String manifestSha256,String dataSha256,JsonNode manifest) {
        public Bundle { manifest=manifest.deepCopy(); }
        @Override public JsonNode manifest(){return manifest.deepCopy();}
    }
    private final ObjectMapper mapper;
    private final Map<String,Bundle> bundles;
    public TaskContentRepository(ObjectMapper mapper) {
        this.mapper=mapper;Map<String,Bundle> loaded=new LinkedHashMap<>();
        try { JsonNode catalog=mapper.readTree(resource("catalog.json"));if(!catalog.path("schemaVersion").asText().equals("content-catalog-v1")||catalog.size()!=2||!catalog.path("manifests").isArray())throw integrity();Set<String> ids=new HashSet<>();Set<String> versions=new HashSet<>();
            for(JsonNode entry:catalog.get("manifests")){if(!entry.isTextual())throw integrity();String path=entry.asText();Bundle bundle=load(path);JsonNode m=bundle.manifest();if(loaded.put(path,bundle)!=null||!ids.add(m.path("taskVersionId").asText())||!versions.add(m.path("contentKind").asText()+":"+m.path("majorCode").asText()+":"+m.path("demoKey").asText()+":"+m.path("versionCode").asText()))throw integrity();}
        }catch(ApiException e){throw e;}catch(Exception e){throw integrity();}bundles=Collections.unmodifiableMap(loaded);
    }
    public Collection<Bundle> bundles(){return bundles.values();}
    public Bundle get(String path){Bundle b=bundles.get(path);if(b==null)throw new ApiException(404,"CONTENT_UNAVAILABLE");return b;}
    public byte[] asset(Bundle bundle,String key,boolean publicOnly){for(JsonNode asset:bundle.manifest().path("assets"))if(asset.path("assetKey").asText().equals(key)){if(publicOnly&&!asset.path("visibility").asText().equals("PUBLIC"))throw new ApiException(404,"CONTENT_UNAVAILABLE");return checkedAsset(asset);}throw new ApiException(404,"CONTENT_UNAVAILABLE");}
    private Bundle load(String path)throws Exception {
        byte[] raw=resource(path);JsonNode m=mapper.readTree(raw);TaskManifestValidator.validate(m);List<String> hashes=new ArrayList<>();
        Map<String,byte[]> loadedAssets=new HashMap<>();for(JsonNode asset:m.path("assets")){loadedAssets.put(asset.path("assetKey").asText(),checkedAsset(asset));hashes.add(asset.path("assetKey").asText()+":"+asset.path("sha256").asText());}Collections.sort(hashes);
        if(m.path("schemaVersion").asText().equals("task-manifest-v2"))com.ruoyi.majorpilot.classifier.ClassifierAssets.validate(loadedAssets);
        if(m.path("schemaVersion").asText().equals("task-manifest-v3")){com.ruoyi.majorpilot.datascience.DsAssets.validate(loadedAssets);for(JsonNode sample:mapper.readTree(loadedAssets.get("golden-private")).path("cases")){JsonNode operation=null;for(JsonNode candidate:m.path("operations"))if(candidate.path("operationKey").equals(sample.path("operationKey")))operation=candidate;if(operation==null)throw integrity();TaskInputValidator.validate(operation.path("parametersSchema"),sample.path("parameters"),true);TaskInputValidator.validate(operation.path("resultSchema"),sample.path("result"),true);}}
        if(m.path("schemaVersion").asText().equals("task-manifest-v4")){com.ruoyi.majorpilot.businessanalytics.BaAssets.validate(loadedAssets,resource("ds-learning/1.0.0/canonical-events-private.json"));for(JsonNode sample:mapper.readTree(loadedAssets.get("golden-private")).path("cases")){JsonNode operation=null;for(JsonNode candidate:m.path("operations"))if(candidate.path("operationKey").equals(sample.path("operationKey")))operation=candidate;if(operation==null)throw integrity();TaskInputValidator.validate(operation.path("parametersSchema"),sample.path("parameters"),true);TaskInputValidator.validate(operation.path("resultSchema"),sample.path("result"),true);}}
        if(com.ruoyi.majorpilot.learning.MethodGuide.enabled(m))com.ruoyi.majorpilot.learning.MethodGuide.validate(m,mapper.readTree(loadedAssets.get("method-guide")));
        return new Bundle(path,hash(raw),hash(String.join("\n",hashes).getBytes(StandardCharsets.UTF_8)),m);
    }
    private byte[] checkedAsset(JsonNode asset){byte[] raw=resource(asset.path("path").asText());if(raw.length!=asset.path("byteLength").asLong()||!hash(raw).equals(asset.path("sha256").asText()))throw integrity();
        String text=new String(raw,StandardCharsets.UTF_8);if(text.matches("(?is).*(https?://|file:|javascript:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|(?<![0-9])1[3-9][0-9]{9}(?![0-9])).*"))throw integrity();
        if(asset.path("mediaType").asText().equals("application/json"))try{if(mapper.readTree(raw)==null)throw integrity();}catch(Exception e){throw integrity();}return raw;}
    private static byte[] resource(String path){TaskManifestValidator.safePath(path);try(InputStream in=TaskContentRepository.class.getClassLoader().getResourceAsStream("task-content/"+path)){if(in==null)throw integrity();byte[] raw=in.readNBytes(1048577);if(raw.length>1048576)throw integrity();return raw;}catch(ApiException e){throw e;}catch(Exception e){throw integrity();}}
    public static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception e){throw integrity();}}
    static ApiException integrity(){return new ApiException(503,"CONTENT_INTEGRITY_FAILED");}
}
