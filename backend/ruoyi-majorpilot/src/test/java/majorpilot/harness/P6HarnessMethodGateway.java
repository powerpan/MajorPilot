package majorpilot.harness;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.integration.ai.MethodReportGateway;
import java.util.*;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Test sources only. Explicitly labelled structural output; never calls HTTP or a provider. */
@Component @Primary @Profile("p6-harness")
public final class P6HarnessMethodGateway extends MethodReportGateway {
    private final ObjectMapper mapper;
    public P6HarnessMethodGateway(ObjectMapper mapper,Environment environment){super(mapper,environment);this.mapper=mapper;}
    @Override public boolean enabled(){return true;}
    @Override public String provider(){return "TEST_REPLAY";}
    @Override public String model(){return "test-method-structure-v1";}
    @Override public Result call(JsonNode input,JsonNode draft,boolean review){return new Result(proposal(mapper,input),provider(),model(),0L,0L,0L,1,null);}
    public static ObjectNode proposal(ObjectMapper m,JsonNode input){
        var out=m.createObjectNode();var sources=input.path("sources");var first=sources.get(0).path("ref").asText();
        out.put("summary","这是一份明确标记的合成结构测试结果，不代表模型语义或学生能力。");out.putArray("summaryRefs").add(first);out.putArray("highlights");var answers=out.putArray("answers");
        for(var s:sources)if(s.path("requiredFinding").asBoolean())answers.addObject().put("sourceRef",s.path("ref").asText()).put("assessment","INSUFFICIENT").put("explanation","本项为结构测试，不作真实学习判断。").put("nextStep","回看题目和自己的解释。");
        var nodes=out.putArray("nodes");for(var c:input.path("checkpoints")){
            String id=c.path("checkpointId").asText();JsonNode sample=null;for(var s:sources)if(s.path("checkpointId").asText().equals(id)&&s.path("studentText").asBoolean()&&!s.path("value").asText().isBlank()){sample=s;break;}if(sample==null)throw new IllegalArgumentException("No student quote");
            String ref=sample.path("ref").asText();var n=nodes.addObject().put("checkpointId",id).put("assessment","INSUFFICIENT").put("reasoning","这项为离线结构检查，未运行模型，不提供语义判断。").put("nextStep","结合本页例子说明自己的想法。").put("example","");n.putArray("quotes").addObject().put("sourceRef",ref).put("quote",sample.path("value").asText());n.putObject("change").put("state","NO_COMPARISON").put("explanation","结构测试没有判断变化。").putArray("sourceRefs").add(ref);n.putObject("dependency").put("explanation","本项不推断上游理解程度。").putArray("sourceRefs").add(ref);
        }
        out.put("preference","此处仅保留本人的感受，不由答题表现推断。");var refs=out.putArray("preferenceRefs");for(var s:sources)if(s.path("kind").asText().equals("REFLECTION"))refs.add(s.path("ref").asText());
        var compared=out.putArray("comparison");if(input.path("runs").size()>1){var c=compared.addObject().put("text","合成测试并列不同工作方式，不作专业排名。");var r=c.putArray("sourceRefs");var majors=new HashSet<String>();for(var s:sources)if(majors.add(s.path("majorCode").asText()))r.add(s.path("ref").asText());}return out;
    }
}
