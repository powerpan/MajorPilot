package com.ruoyi.majorpilot.experience;
import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.content.TaskInputValidator;
import com.ruoyi.majorpilot.shared.ApiException;
/** The content pipeline and runtime enforce one schema subset. */
public final class ResponseRules {
    private ResponseRules() {}
    public static void validate(JsonNode schema,JsonNode value,boolean complete) {
        try {TaskInputValidator.validate(schema,value,complete);}catch(ApiException invalid){throw new ApiException(422,"STEP_VALIDATION_FAILED");}
    }
}
