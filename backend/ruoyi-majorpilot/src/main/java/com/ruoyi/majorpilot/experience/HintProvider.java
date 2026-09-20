package com.ruoyi.majorpilot.experience;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/** Vendor-independent boundary. No database transaction may be open during this call. */
public interface HintProvider {
    record Context(String taskVersionId,String versionCode,String stepKey,int hintLevel,String promptVersion,
                   JsonNode safeContext,String staticHint,boolean demo,String runMode) {
        public Context(String taskVersionId,String versionCode,String stepKey,int hintLevel,String promptVersion,JsonNode safeContext,String staticHint,boolean demo){this(taskVersionId,versionCode,stepKey,hintLevel,promptVersion,safeContext,staticHint,demo,"STANDARD");}
    }
    record Telemetry(long durationMs,int httpAttempts,int repairAttempts,String errorCode,List<String> inputFieldKeys) {}
    record Result(JsonNode response,String provider,String model,String promptVersion,String status,Telemetry telemetry) {
        public Result(JsonNode response,String provider,String model,String promptVersion,String status){this(response,provider,model,promptVersion,status,null);}
    }
    Result hint(Context context);
    /** Optional single follow-up; failure never introduces a mandatory question. */
    default Result followUp(Context context) { return new Result(null,"NONE",null,context.promptVersion(),"FAILED"); }
}
