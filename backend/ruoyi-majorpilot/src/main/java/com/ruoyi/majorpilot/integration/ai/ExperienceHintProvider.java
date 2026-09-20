package com.ruoyi.majorpilot.integration.ai;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ruoyi.majorpilot.content.*;
import com.ruoyi.majorpilot.experience.HintProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

/** Static reviewed fallback by default, even when P0 has configured a live provider and key. */
@Service @Profile("local")
public final class ExperienceHintProvider implements HintProvider {
    private final TaskContentProvider content;private final HintBailianGateway gateway;private final FollowUpBailianGateway followUpGateway;
    @Autowired
    public ExperienceHintProvider(TaskContentProvider content,Environment env){this.content=content;HintBailianGateway enabled=null;FollowUpBailianGateway follow=null;if(env.getProperty("MP_EXPERIENCE_AI_ENABLED",Boolean.class,false)&&env.getProperty("MAJORPILOT_AI_MODE","fake").equals("bailian")){try{enabled=new HintBailianGateway(env.getProperty("BAILIAN_API_KEY"),fallback(env,"BAILIAN_BASE_URL",BailianAiGateway.DEFAULT_BASE_URL),fallback(env,"BAILIAN_MODEL",BailianAiGateway.DEFAULT_MODEL));follow=new FollowUpBailianGateway(env.getProperty("BAILIAN_API_KEY"),fallback(env,"BAILIAN_BASE_URL",BailianAiGateway.DEFAULT_BASE_URL),fallback(env,"BAILIAN_MODEL",BailianAiGateway.DEFAULT_MODEL));}catch(AiFailure ignored){/* Misconfigured optional AI must not stop the task. */}}gateway=enabled;followUpGateway=follow;}
    ExperienceHintProvider(TaskContentProvider content,HintBailianGateway gateway){this(content,gateway,null);}
    ExperienceHintProvider(TaskContentProvider content,HintBailianGateway gateway,FollowUpBailianGateway followUpGateway){this.content=content;this.gateway=gateway;this.followUpGateway=followUpGateway;}
    private TaskContent.Version version(Context context){return context.runMode().equals("REVIEW_PREVIEW")?content.pinnedForPreview(context.taskVersionId()):content.pinned(context.taskVersionId());}
    @Override public Result hint(Context context){TaskContent.Version version=version(context);JsonNode step=null;for(JsonNode s:version.manifest().path("steps"))if(s.path("stepKey").asText().equals(context.stepKey()))step=s;if(step==null||context.hintLevel()<1||context.hintLevel()>3)throw new AiFailure(AiFailure.Code.INVALID_INPUT);String staticHint=null;for(JsonNode h:step.path("hints"))if(h.path("level").asInt()==context.hintLevel())staticHint=h.path("text").asText();if(staticHint==null)throw new AiFailure(AiFailure.Code.INVALID_INPUT);
        ObjectNode safe=new ObjectMapper().createObjectNode();for(JsonNode key:step.path("hintContextFields")){JsonNode value=context.safeContext().path("input").get(key.asText()),schema=step.at("/inputSchema/properties").get(key.asText());if(value!=null&&schema!=null&&(schema.has("enum")||value.isNumber()||value.isBoolean())){try{TaskInputValidator.validate(schema,value,true);safe.set(key.asText(),value.deepCopy());}catch(RuntimeException ignored){/* Invalid context never leaves the backend. */}}}
        var request=new HintBailianGateway.Request(version.taskVersionId(),context.stepKey(),context.hintLevel(),step.path("instructions").asText(),staticHint,safe);
        if(gateway!=null){var output=gateway.call(request);if(output.response()!=null)return new Result(output.response(),"BAILIAN",gateway.model(),"task-hint-v1","SUCCEEDED",output.telemetry());return new Result(HintBailianGateway.result(request,staticHint),"STATIC",gateway.model(),"task-hint-v1","FALLBACK",output.telemetry());}
        return new Result(HintBailianGateway.result(request,staticHint),"STATIC",null,"task-hint-v1","FALLBACK",new Telemetry(0,0,0,"AI_DISABLED",java.util.List.of()));
    }
    @Override public Result followUp(Context context){TaskContent.Version version=version(context);ObjectNode safe=new ObjectMapper().createObjectNode();JsonNode properties=version.manifest().at("/reflection/inputSchema/properties");for(String key:java.util.List.of("continueSimilarWork","nextWorkStyle","interestingStepKeys","difficultySources")){JsonNode value=context.safeContext().get(key),schema=properties.get(key);if(value!=null&&schema!=null)try{TaskInputValidator.validate(schema,value,true);safe.set(key,value.deepCopy());}catch(RuntimeException ignored){/* Unknown or invalid choices never leave the server. */}}
        if(followUpGateway==null)return new Result(null,"NONE",null,"reflection-follow-up-v1","FAILED",new Telemetry(0,0,0,"AI_DISABLED",java.util.List.of()));
        var output=followUpGateway.followUp(new FollowUpBailianGateway.Request(version.taskVersionId(),version.manifest().path("title").asText(),safe));return new Result(output.response(),"BAILIAN",followUpGateway.model(),"reflection-follow-up-v1",output.response()==null?"FAILED":"SUCCEEDED",output.telemetry());
    }
    private static String fallback(Environment env,String key,String fallback){String value=env.getProperty(key);return value==null||value.isBlank()?fallback:value;}
}
