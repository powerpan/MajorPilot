package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;

/** Vendor-independent boundary. No database transaction may be open during this call. */
public interface HintProvider {
    record Context(String taskVersionId,String versionCode,String stepKey,int hintLevel,String promptVersion,
                   JsonNode safeContext,String staticHint,boolean demo) {}
    record Result(JsonNode response,String provider,String model,String promptVersion,String status) {}
    Result hint(Context context);
    /** Optional single follow-up; failure never introduces a mandatory question. */
    default Result followUp(Context context) { return new Result(null,"NONE",null,context.promptVersion(),"FAILED"); }
}
