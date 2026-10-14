package com.ruoyi.majorpilot.experience;

import com.ruoyi.majorpilot.shared.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @Profile({"local","pilot"}) @RequestMapping("/api/app/v1/experience-runs/{id}/learning")
public class GuidedLearningController {
    private final RunService runs; private final GuidedLearning learning;
    public GuidedLearningController(RunService runs,GuidedLearning learning){this.runs=runs;this.learning=learning;}
    @GetMapping Object get(@PathVariable String id,HttpServletRequest request){var student=ApiResponses.student(request);return ApiResponses.success(request,runs.transactions().execute(t->{runs.store().activeStudent(student);return learning.view(runs.store().owned(student,id));}));}
    @PostMapping("/events") Object event(@PathVariable String id,@RequestHeader(value="Idempotency-Key",required=false)String key,@RequestBody GuidedLearning.Change input,HttpServletRequest request){var student=ApiResponses.student(request);return ApiResponses.success(request,runs.writeOwned(student,id,"/experience-runs/"+id+"/learning/events",key,input,Map.class,()->{var run=runs.store().owned(student,id);runs.dependencies(run,runs.stepDefinition(run,input.stepKey()));return learning.change(run,input);}));}
    @PostMapping("/local-results") Object check(@PathVariable String id,@RequestHeader(value="Idempotency-Key",required=false)String key,@RequestBody GuidedLearning.Check input,HttpServletRequest request){var student=ApiResponses.student(request);return ApiResponses.success(request,runs.writeOwned(student,id,"/experience-runs/"+id+"/learning/local-results",key,input,Map.class,()->{var run=runs.store().owned(student,id);runs.dependencies(run,runs.stepDefinition(run,input.stepKey()));return learning.check(run,input);}));}
}
