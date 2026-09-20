package com.ruoyi.majorpilot.content;

import com.fasterxml.jackson.databind.JsonNode;

/** Immutable, hash-verified content. Never serialize Version directly to a student. */
public final class TaskContent {
    private TaskContent() {}
    public record Version(long internalId, String taskVersionId, String contentKind, String majorCode,
                          String demoKey, String versionCode, String manifestSha256, JsonNode manifest) {
        public Version { manifest = manifest.deepCopy(); }
        @Override public JsonNode manifest() { return manifest.deepCopy(); }
    }
    public record Asset(String mediaType, byte[] bytes, String sha256) {
        public Asset { bytes = bytes.clone(); }
        @Override public byte[] bytes() { return bytes.clone(); }
    }
}
