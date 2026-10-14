package com.ruoyi.majorpilot.security;
import com.ruoyi.majorpilot.shared.*;
import java.time.Duration;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
@Service @Profile({"local","pilot"})
public class RateLimits {
    private final StringRedisTemplate redis;private final Secrets secrets;
    private static final DefaultRedisScript<Long> COUNT=new DefaultRedisScript<>("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n",Long.class);
    public RateLimits(StringRedisTemplate redis,Secrets secrets) { this.redis=redis;this.secrets=secrets; }
    public void require(String operation,String subject,int limit,Duration window) {
        Long count;try { count=redis.execute(COUNT,List.of("mp:p1:rate:"+secrets.hmac("rate",operation+":"+subject)),Long.toString(window.toMillis())); }
        catch(RuntimeException unavailable) { throw new ApiException(503,"SECURITY_SERVICE_UNAVAILABLE"); }
        if(count==null)throw new ApiException(503,"SECURITY_SERVICE_UNAVAILABLE");
        if(count>limit)throw new ApiException(429,"RATE_LIMITED");
    }
}
