package com.ruoyi.majorpilot.content;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.majorpilot.shared.ApiResponses;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
@RestController @Profile({"local","pilot"}) @RequestMapping("/api/admin/v1/majorpilot/task-versions")
public class TaskContentController {
    private final TaskPublicationService service;
    public TaskContentController(TaskPublicationService service){this.service=service;}
    @GetMapping @PreAuthorize("@ss.hasPermi('majorpilot:task:view')") public Object list(HttpServletRequest req){return ApiResponses.success(req,service.list());}
    @PostMapping("/validate") @PreAuthorize("@ss.hasPermi('majorpilot:task:publish')") public Object validate(@RequestBody TaskPublicationService.Validate input,HttpServletRequest req){return ApiResponses.success(req,service.validate(input,SecurityUtils.getUserId(),ApiResponses.requestId(req)));}
    @PostMapping("/{id}/publish") @PreAuthorize("@ss.hasPermi('majorpilot:task:publish')") public Object publish(@PathVariable String id,@RequestBody TaskPublicationService.Publish input,HttpServletRequest req){return ApiResponses.success(req,service.publish(id,input,SecurityUtils.getUserId(),ApiResponses.requestId(req)));}
    @PostMapping("/{id}/retire") @PreAuthorize("@ss.hasPermi('majorpilot:task:publish')") public Object retire(@PathVariable String id,@RequestBody TaskPublicationService.Retire input,HttpServletRequest req){return ApiResponses.success(req,service.retire(id,input,SecurityUtils.getUserId(),ApiResponses.requestId(req)));}
}
