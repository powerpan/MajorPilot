package com.ruoyi.majorpilot.experience;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController @Profile("local") @RequestMapping("/api/admin/v1/majorpilot")
public class ProductAdoptionController {
    private final ProductAdoptionService service;
    public ProductAdoptionController(ProductAdoptionService service){this.service=service;}
    @PostMapping("/task-versions/{id}/local-product-release") @PreAuthorize("@ss.hasPermi('majorpilot:task:publish')")
    public Object release(@PathVariable String id,@RequestBody ProductAdoptionService.Release input,HttpServletRequest request){return ApiResponses.success(request,service.release(id,input,SecurityUtils.getUserId(),ApiResponses.requestId(request)));}
    @PostMapping("/experience-runs/{id}/product-adoption") @PreAuthorize("@ss.hasPermi('majorpilot:recovery:create') and @ss.hasPermi('majorpilot:report:regenerate')")
    public Object adopt(@PathVariable String id,@RequestBody ProductAdoptionService.Adopt input,HttpServletRequest request){return ApiResponses.success(request,service.adopt(id,input,SecurityUtils.getUserId(),ApiResponses.requestId(request)));}
}
