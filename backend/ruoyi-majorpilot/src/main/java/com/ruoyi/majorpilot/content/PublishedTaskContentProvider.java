package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.shared.ApiException;
import com.ruoyi.majorpilot.acceptance.LocalProductAccess;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service @Profile({"local","pilot"})
public final class PublishedTaskContentProvider implements TaskContentProvider {
    private final JdbcTemplate db;private final TaskContentRepository repository;private final boolean demoEnabled,previewEnabled;
    private LocalProductAccess local;
    @Autowired public void localProductAccess(LocalProductAccess local){this.local=local;}
    @Autowired
    public PublishedTaskContentProvider(JdbcTemplate db,TaskContentRepository repository,@Value("${MP_P2_DEMO_ENABLED:false}") boolean demoEnabled,@Value("${MP_CONTENT_PREVIEW_ENABLED:false}")boolean previewEnabled){this.db=db;this.repository=repository;this.demoEnabled=demoEnabled;this.previewEnabled=previewEnabled;}
    public PublishedTaskContentProvider(JdbcTemplate db,TaskContentRepository repository,boolean demoEnabled){this(db,repository,demoEnabled,false);}
    @Override public TaskContent.Version currentMajor(String majorCode){return one("t.content_kind='MAJOR' AND m.code=? AND m.status='ACTIVE' AND (t.status='PUBLISHED' OR (t.status='REVIEW' AND "+(local==null?"FALSE":local.releasedSql("t"))+")) ORDER BY (t.status='PUBLISHED') DESC,t.id DESC LIMIT 1",majorCode);}
    @Override public TaskContent.Version currentDemo(String demoKey){if(!demoEnabled)throw new ApiException(403,"DEMO_DISABLED");return one("t.content_kind='DEMO' AND t.demo_key=? AND t.status='PUBLISHED'",demoKey);}
    @Override public TaskContent.Version pinned(String id){return one("t.public_id=? AND (t.status IN ('PUBLISHED','RETIRED') OR (t.content_kind='MAJOR' AND t.status='REVIEW' AND "+LocalProductAccess.pinnedSql("t")+"))",id);}
    @Override public TaskContent.Version review(String id){preview();return one("t.public_id=? AND t.content_kind='MAJOR' AND t.status='REVIEW'",id);}
    @Override public TaskContent.Version pinnedForPreview(String id){preview();return one("t.public_id=? AND t.content_kind='MAJOR' AND t.status IN ('REVIEW','PUBLISHED','RETIRED')",id);}
    @Override public List<TaskContent.Version> reviewVersions(){preview();return db.queryForList("SELECT public_id FROM mp_task_version WHERE content_kind='MAJOR' AND status='REVIEW' ORDER BY id",String.class).stream().map(this::review).toList();}
    private void preview(){if(!previewEnabled)throw new ApiException(403,"CONTENT_PREVIEW_DISABLED");}
    @Override public TaskContent.Asset publicAsset(TaskContent.Version version,String key){TaskContentRepository.Bundle bundle=bundleById(version.taskVersionId());if(!bundle.manifestSha256().equals(version.manifestSha256()))throw TaskContentRepository.integrity();for(JsonNode asset:bundle.manifest().path("assets"))if(asset.path("assetKey").asText().equals(key)&&asset.path("visibility").asText().equals("PUBLIC"))return new TaskContent.Asset(asset.path("mediaType").asText(),repository.asset(bundle,key,true),asset.path("sha256").asText());throw new ApiException(404,"CONTENT_UNAVAILABLE");}
    private TaskContentRepository.Bundle bundleById(String id){return repository.bundles().stream().filter(b->b.manifest().path("taskVersionId").asText().equals(id)).findFirst().orElseThrow(TaskContentRepository::integrity);}
    private TaskContent.Version one(String condition,String parameter){List<Map<String,Object>> rows=db.queryForList("SELECT t.*,m.code major_code FROM mp_task_version t LEFT JOIN mp_major m ON m.id=t.major_id WHERE "+condition,parameter);if(rows.size()!=1)throw new ApiException(404,"CONTENT_UNAVAILABLE");Map<String,Object> row=rows.getFirst();TaskContentRepository.Bundle bundle=repository.get(row.get("manifest_path").toString());JsonNode m=bundle.manifest();if(!bundle.manifestSha256().equals(row.get("manifest_sha256"))||!bundle.dataSha256().equals(row.get("data_sha256"))||!m.path("taskVersionId").asText().equals(row.get("public_id"))||!m.path("versionCode").asText().equals(row.get("version_code"))||!m.path("contentKind").asText().equals(row.get("content_kind"))||!m.path("schemaVersion").asText().equals(row.get("content_schema_version"))||!Objects.equals(m.path("majorCode").asText(null),row.get("major_code"))||!Objects.equals(m.path("demoKey").asText(null),row.get("demo_key")))throw TaskContentRepository.integrity();String kind=row.get("content_kind").toString();if(kind.equals("DEMO")&&!demoEnabled)throw new ApiException(403,"DEMO_DISABLED");return new TaskContent.Version(((Number)row.get("id")).longValue(),row.get("public_id").toString(),kind,(String)row.get("major_code"),(String)row.get("demo_key"),row.get("version_code").toString(),bundle.manifestSha256(),m);}
}
