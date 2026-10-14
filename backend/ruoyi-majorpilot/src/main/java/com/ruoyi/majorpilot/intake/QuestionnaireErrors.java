package com.ruoyi.majorpilot.intake;

import java.util.List;
import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import com.ruoyi.majorpilot.shared.ApiException;
import com.ruoyi.majorpilot.shared.ApiResponses;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(basePackages={"com.ruoyi.majorpilot.intake","com.ruoyi.majorpilot.recommendation","com.ruoyi.majorpilot.analytics"}) @Profile({"local","pilot"}) @Order(-300)
public class QuestionnaireErrors {
    @ExceptionHandler(Questionnaire.Invalid.class) public ResponseEntity<?> invalid(Questionnaire.Invalid failure,HttpServletRequest req) {
        return ResponseEntity.unprocessableEntity().body(ApiResponses.error(req,new ApiException(422,"DECISION_PROFILE_INVALID",List.of(Map.of("field",failure.field(),"code","INVALID")))));
    }
}
