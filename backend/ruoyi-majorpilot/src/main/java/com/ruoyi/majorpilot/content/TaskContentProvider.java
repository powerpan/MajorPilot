package com.ruoyi.majorpilot.content;

public interface TaskContentProvider {
    TaskContent.Version currentMajor(String majorCode);
    TaskContent.Version currentDemo(String demoKey);
    /** Pinned PUBLISHED or RETIRED versions remain readable; never substitutes the latest version. */
    TaskContent.Version pinned(String taskVersionId);
    /** REVIEW access is exclusively for an already authorized local preview Run. */
    default TaskContent.Version review(String taskVersionId) {throw new com.ruoyi.majorpilot.shared.ApiException(404,"CONTENT_UNAVAILABLE");}
    default TaskContent.Version pinnedForPreview(String taskVersionId) {throw new com.ruoyi.majorpilot.shared.ApiException(404,"CONTENT_UNAVAILABLE");}
    default java.util.List<TaskContent.Version> reviewVersions() {return java.util.List.of();}
    TaskContent.Asset publicAsset(TaskContent.Version version, String assetKey);
}
