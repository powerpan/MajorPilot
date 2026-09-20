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
    private final TaskContentProvider content;private final HintBailianGateway gateway;
    @Autowired
    public ExperienceHintProvider(TaskContentProvider content,Environment env){this.content=content;HintBailianGateway enabled=null;if(env.getProperty("MP_EXPERIENCE_AI_ENABLED",Boolean.class,false)&&env.getProperty("MAJORPILOT_AI_MODE","fake").equals("bailian")){try{enabled=new HintBailianGateway(env.getProperty("BAILIAN_API_KEY"),fallback(env,"BAILIAN_BASE_URL",BailianAiGateway.DEFAULT_BASE_URL),fallback(env,"BAILIAN_MODEL",BailianAiGateway.DEFAULT_MODEL));}catch(AiFailure ignored){/* Misconfigured optional AI must not stop the task. */}}gateway=enabled;}
    ExperienceHintProvider(TaskContentProvider content,HintBailianGateway gateway){this.content=content;this.gateway=gateway;}
    @Override public Result hint(Context context){TaskContent.Version version=content.pinned(context.taskVersionId());JsonNode step=null;for(JsonNode s:version.manifest().path("steps"))if(s.path("stepKey").asText().equals(context.stepKey()))step=s;if(step==null||context.hintLevel()<1||context.hintLevel()>3)throw new AiFailure(AiFailure.Code.INVALID_INPUT);String staticHint=null;for(JsonNode h:step.path("hints"))if(h.path("level").asInt()==context.hintLevel())staticHint=h.path("text").asText();if(staticHint==null)throw new AiFailure(AiFailure.Code.INVALID_INPUT);
        ObjectNode safe=new ObjectMapper().createObjectNode();for(JsonNode key:step.path("hintContextFields")){JsonNode value=context.safeContext().path("input").get(key.asText()),schema=step.at("/inputSchema/properties").get(key.asText());if(value!=null&&schema!=null&&(schema.has("enum")||value.isNumber()||value.isBoolean())){try{TaskInputValidator.validate(schema,value,true);safe.set(key.asText(),value.deepCopy());}catch(RuntimeException ignored){/* Invalid context never leaves the backend. */}}}
        var request=new HintBailianGateway.Request(version.taskVersionId(),context.stepKey(),context.hintLevel(),step.path("instructions").asText(),staticHint,safe);
        if(gateway!=null)try{return new Result(gateway.hint(request),"BAILIAN",gateway.model(),"task-hint-v1","SUCCEEDED");}catch(AiFailure ignored){/* Deliberately no provider payload or exception logging. */}
        return new Result(HintBailianGateway.result(request,staticHint),"STATIC",null,"task-hint-v1","FALLBACK");
    }
    private static String fallback(Environment env,String key,String fallback){String value=env.getProperty(key);return value==null||value.isBlank()?fallback:value;}
}
