package com.ruoyi.majorpilot.content;

public interface TaskContentProvider {
    TaskContent.Version currentMajor(String majorCode);
    TaskContent.Version currentDemo(String demoKey);
    /** Pinned PUBLISHED or RETIRED versions remain readable; never substitutes the latest version. */
    TaskContent.Version pinned(String taskVersionId);
    TaskContent.Asset publicAsset(TaskContent.Version version, String assetKey);
}
