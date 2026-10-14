package com.ruoyi.majorpilot.experience;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.content.TaskContentProvider;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @Profile({"local","pilot"}) @RequestMapping("/api/app/v1")
public class RunController {
    private final RunService runs;private final ExecutionService execution;private final HintService hints;private final ReflectionService reflections;private final FollowUpService followUps;
    public RunController(RunService runs,ExecutionService execution,HintService hints,ReflectionService reflections,FollowUpService followUps){this.runs=runs;this.execution=execution;this.hints=hints;this.reflections=reflections;this.followUps=followUps;}
    @GetMapping("/demo-tasks") Object demos(HttpServletRequest req){return ApiResponses.success(req,runs.demos(ApiResponses.student(req)));}
    @GetMapping("/review-preview-tasks") Object previews(HttpServletRequest req){return ApiResponses.success(req,runs.previews(ApiResponses.student(req)));}
    @PostMapping("/review-preview-runs") Object preview(@RequestBody RunDtos.CreatePreview input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ResponseEntity.status(201).body(ApiResponses.success(req,runs.createPreview(ApiResponses.student(req),key,input)));}
    @GetMapping("/experience-runs") Object list(HttpServletRequest req){return ApiResponses.success(req,runs.list(ApiResponses.student(req)));}
    @PostMapping("/experience-runs") Object create(@RequestBody RunDtos.Create input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ResponseEntity.status(201).body(ApiResponses.success(req,runs.create(ApiResponses.student(req),key,input)));}
    @GetMapping("/experience-runs/{id}") Object run(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,runs.get(ApiResponses.student(req),id));}
    @PostMapping("/experience-runs/{id}/{operation:start|pause|resume}") Object transition(@PathVariable String id,@PathVariable String operation,@RequestBody RunDtos.Transition input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,runs.transition(ApiResponses.student(req),id,operation,key,input));}
    @GetMapping("/experience-runs/{id}/task") Object task(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,runs.task(ApiResponses.student(req),id));}
    @GetMapping("/experience-runs/{id}/task/assets/{assetKey}") Object asset(@PathVariable String id,@PathVariable String assetKey,HttpServletRequest req){var student=ApiResponses.student(req);return runs.transactions().execute(status->{runs.store().activeStudent(student);var version=runs.version(runs.store().owned(student,id));var asset=runs.contentProvider().publicAsset(version,assetKey);return ResponseEntity.ok().contentType(MediaType.parseMediaType(asset.mediaType())).header("X-Content-SHA256",asset.sha256()).header("X-Content-Type-Options","nosniff").body(asset.bytes());});}
    @GetMapping("/experience-runs/{id}/steps/{stepKey}") Object step(@PathVariable String id,@PathVariable String stepKey,HttpServletRequest req){return ApiResponses.success(req,runs.step(ApiResponses.student(req),id,stepKey));}
    @PutMapping("/experience-runs/{id}/steps/{stepKey}/response") Object save(@PathVariable String id,@PathVariable String stepKey,@RequestBody RunDtos.Save input,HttpServletRequest req){return ApiResponses.success(req,runs.save(ApiResponses.student(req),id,stepKey,input));}
    @PostMapping("/experience-runs/{id}/steps/{stepKey}/complete") Object complete(@PathVariable String id,@PathVariable String stepKey,@RequestBody RunDtos.StepCompletion input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,runs.completeStep(ApiResponses.student(req),id,stepKey,key,input));}
    @PostMapping("/experience-runs/{id}/task-completion") Object taskComplete(@PathVariable String id,@RequestBody RunDtos.Revision input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,runs.taskComplete(ApiResponses.student(req),id,key,input));}
    @PostMapping("/experience-runs/{id}/executions") Object execute(@PathVariable String id,@RequestBody RunDtos.Execute input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,execution.execute(ApiResponses.student(req),id,key,input));}
    @PostMapping("/experience-runs/{id}/hints") Object hint(@PathVariable String id,@RequestBody RunDtos.Hint input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,hints.hint(ApiResponses.student(req),id,key,input));}
    @GetMapping("/experience-runs/{id}/hints/{hintId}") Object hintGet(@PathVariable String id,@PathVariable String hintId,HttpServletRequest req){return ApiResponses.success(req,hints.get(ApiResponses.student(req),id,hintId));}
    @GetMapping("/experience-runs/{id}/reflection") Object reflection(@PathVariable String id,HttpServletRequest req){return ApiResponses.success(req,reflections.get(ApiResponses.student(req),id));}
    @PutMapping("/experience-runs/{id}/reflection") Object saveReflection(@PathVariable String id,@RequestBody RunDtos.ReflectionSave input,HttpServletRequest req){return ApiResponses.success(req,reflections.save(ApiResponses.student(req),id,input));}
    @PostMapping("/experience-runs/{id}/reflection/submission") Object submitReflection(@PathVariable String id,@RequestBody RunDtos.ReflectionSave input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,reflections.submit(ApiResponses.student(req),id,key,input));}
    @PostMapping("/experience-runs/{id}/reflection/follow-up") Object followUp(@PathVariable String id,@RequestBody RunDtos.Revision input,@RequestHeader(value="Idempotency-Key",required=false)String key,HttpServletRequest req){return ApiResponses.success(req,followUps.request(ApiResponses.student(req),id,key,input));}
}
