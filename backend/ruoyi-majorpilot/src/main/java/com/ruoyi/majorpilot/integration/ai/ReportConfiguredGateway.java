package com.ruoyi.majorpilot.integration.ai;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.report.core.ReportCore;
import org.springframework.core.env.Environment;

/** Explicit report opt-in, independent of P0 and task-hint live modes. No startup network activity. */
public final class ReportConfiguredGateway implements ReportGateway {
    private final ReportGateway delegate;
    public ReportConfiguredGateway(ObjectMapper mapper,ReportCore core,Environment env){ReportGateway selected=null;if(env.getProperty("MP_REPORT_AI_ENABLED",Boolean.class,false)){try{String provider=env.getProperty("MP_REPORT_AI_PROVIDER","BAILIAN").toUpperCase(java.util.Locale.ROOT);if(provider.equals("BAILIAN"))selected=new ReportHttpGateway(mapper,core,provider,env.getProperty("BAILIAN_API_KEY"),value(env,"BAILIAN_BASE_URL",BailianAiGateway.DEFAULT_BASE_URL),value(env,"BAILIAN_MODEL",BailianAiGateway.DEFAULT_MODEL));else if(provider.equals("DEEPSEEK"))selected=new ReportHttpGateway(mapper,core,provider,env.getProperty("DEEPSEEK_API_KEY"),value(env,"DEEPSEEK_BASE_URL",ReportHttpGateway.DEEPSEEK_BASE_URL),value(env,"DEEPSEEK_MODEL",ReportHttpGateway.DEEPSEEK_MODEL));}catch(AiFailure ignored){/* Optional configuration fails closed to deterministic report fallback. */}}delegate=selected;}
    @Override public boolean available(){return delegate!=null&&delegate.available();}
    @Override public Outcome attempt(Attempt request){if(!available())throw new AiFailure(AiFailure.Code.CONFIG_INVALID);return delegate.attempt(request);}
    private static String value(Environment env,String key,String fallback){String result=env.getProperty(key);return result==null||result.isBlank()?fallback:result;}
}
