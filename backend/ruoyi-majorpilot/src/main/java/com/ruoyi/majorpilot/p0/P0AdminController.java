package com.ruoyi.majorpilot.p0;

import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import com.ruoyi.common.utils.SecurityUtils;

@RestController @Profile("p0")
public class P0AdminController {
    @PreAuthorize("@ss.hasPermi('majorpilot:p0:read')")
    @GetMapping("/api/admin/v1/majorpilot/p0/whoami")
    public Object whoami(HttpServletRequest req) { return P0Http.success(req,Map.of("subjectType","RUOYI_OPERATOR","userId",SecurityUtils.getUserId())); }
}
