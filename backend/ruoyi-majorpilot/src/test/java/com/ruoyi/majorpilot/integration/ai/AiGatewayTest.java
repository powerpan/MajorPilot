package com.ruoyi.majorpilot.integration.ai;

import static org.junit.jupiter.api.Assertions.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class AiGatewayTest {
    private static final String TEST_VALUE="local-probe-test-placeholder";
    private static final AiGateway.Request REQUEST=new AiGateway.Request(AiGateway.Workload.INITIAL_RECOMMENDATION_EXPLANATION,"p0-synthetic-v1");
    private static BailianAiGateway gateway(BailianAiGateway.Transport transport,int attempts,long deadline) {
        return new BailianAiGateway(TEST_VALUE,BailianAiGateway.DEFAULT_BASE_URL,BailianAiGateway.DEFAULT_MODEL,transport,attempts,deadline,1000,millis -> {});
    }
    private static byte[] completion(String content) {
        try { return new ObjectMapper().writeValueAsBytes(Map.of("choices",List.of(Map.of("finish_reason","stop","message",Map.of("content",content))),"usage",Map.of("prompt_tokens",10,"completion_tokens",5))); }
        catch(Exception error) { throw new AssertionError(error); }
    }

    @Test void fakeValidatesItsVersionedFixture() {
        var result=new FakeAiGateway().generate(REQUEST);
        assertEquals("DATA_SCIENCE",result.payload().major());assertEquals("FAKE",result.metadata().mode());assertEquals(0,result.metadata().attempts());
    }
    @Test void replayIsExplicitAndCannotInventMissingRequests() {
        var gateway=new ReplayAiGateway(Map.of(REQUEST,FakeAiGateway.FIXTURE));
        assertEquals("REPLAY",gateway.generate(REQUEST).metadata().mode());
        var other=new AiGateway.Request(AiGateway.Workload.HINT,"p0-synthetic-v1");
        assertEquals(AiFailure.Code.REPLAY_MISSING,assertThrows(AiFailure.class,()->gateway.generate(other)).code());
    }
    @Test void invalidReplayIsRejectedBeforeUse() {
        assertThrows(AiFailure.class,()->new ReplayAiGateway(Map.of(REQUEST,"{\"fitScore\":99}")));
    }
    @Test void requestHasNoArbitraryPromptOrStudentData() {
        assertThrows(AiFailure.class,()->new AiGateway.Request(AiGateway.Workload.HINT,"unreviewed-prompt"));
        assertEquals(2,AiGateway.Request.class.getRecordComponents().length);
    }
    @Test void validatesEvidenceMajorFieldsAndTextBoundary() {
        assertNotNull(AiResultValidator.validate(FakeAiGateway.FIXTURE));
        for(String content:List.of(FakeAiGateway.FIXTURE.replace("synthetic_ev_1","invented"),FakeAiGateway.FIXTURE.replace("DATA_SCIENCE","AI"),FakeAiGateway.FIXTURE.replace("先尝试数据清理；这只是体验顺序建议。","<script>bad</script>"),FakeAiGateway.FIXTURE.replace("\"major\"","\"fitScore\""),"not-json")) assertEquals(AiFailure.Code.INVALID_OUTPUT,assertThrows(AiFailure.class,()->AiResultValidator.validate(content)).code());
    }
    @Test void rejectsOffRegionRedirectAndCredentialBearingEndpoints() {
        for(String endpoint:List.of("https://evil.invalid/compatible-mode/v1","https://dashscope.aliyuncs.com.evil.invalid/compatible-mode/v1","http://dashscope.aliyuncs.com/compatible-mode/v1","https://user:password@dashscope.aliyuncs.com/compatible-mode/v1","https://dashscope-intl.aliyuncs.com/compatible-mode/v1","https://dashscope.aliyuncs.com/compatible-mode/v1?key=x")) assertThrows(AiFailure.class,()->BailianAiGateway.validateEndpoint(endpoint));
        assertEquals("workspace-123.cn-beijing.maas.aliyuncs.com",BailianAiGateway.validateEndpoint("https://workspace-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1").getHost());
    }
    @Test void validResponseReturnsOnlyStructuredPayloadAndSafeMetadata() {
        var result=gateway((request,timeout)-> {
            assertEquals("Bearer "+TEST_VALUE,request.headers().firstValue("Authorization").orElseThrow());
            assertTrue(timeout<=1000);
            return new BailianAiGateway.TransportResponse(200,completion(FakeAiGateway.FIXTURE));
        },1,3000).generate(REQUEST);
        assertEquals("BAILIAN",result.metadata().mode());assertEquals(10,result.metadata().promptTokens());assertFalse(result.toString().contains(TEST_VALUE));
    }
    @Test void rateLimitsRetryOnlyWithinBound() {
        AtomicInteger count=new AtomicInteger();
        var adapter=gateway((request,timeout)->new BailianAiGateway.TransportResponse(count.incrementAndGet()==1?429:200,completion(FakeAiGateway.FIXTURE)),2,3000);
        assertEquals(2,adapter.generate(REQUEST).metadata().attempts());assertEquals(2,count.get());
    }
    @Test void repeatedRateLimitFailsAfterMaximumAndNeverLeaksProviderError() {
        AtomicInteger count=new AtomicInteger();
        var adapter=gateway((request,timeout)->{count.incrementAndGet();return new BailianAiGateway.TransportResponse(429,TEST_VALUE.getBytes(StandardCharsets.UTF_8));},3,3000);
        AiFailure error=assertThrows(AiFailure.class,()->adapter.generate(REQUEST));
        assertEquals(AiFailure.Code.RATE_LIMITED,error.code());assertEquals("RATE_LIMITED",error.getMessage());assertNull(error.getCause());assertEquals(3,count.get());
    }
    @Test void authFailureNeverRetries() {
        AtomicInteger count=new AtomicInteger();
        var adapter=gateway((request,timeout)->{count.incrementAndGet();return new BailianAiGateway.TransportResponse(401,TEST_VALUE.getBytes(StandardCharsets.UTF_8));},3,3000);
        assertEquals(AiFailure.Code.AUTH_FAILED,assertThrows(AiFailure.class,()->adapter.generate(REQUEST)).code());assertEquals(1,count.get());
    }
    @Test void timeoutAndGlobalDeadlineAreBounded() {
        AtomicInteger count=new AtomicInteger();
        var adapter=gateway((request,timeout)->{count.incrementAndGet();throw new AiFailure(AiFailure.Code.TIMEOUT);},3,50);
        assertEquals(AiFailure.Code.TIMEOUT,assertThrows(AiFailure.class,()->adapter.generate(REQUEST)).code());assertEquals(1,count.get());
    }
    @Test void schemaFailureDoesNotSilentlyPassOrBecomeTransportRetry() {
        AtomicInteger count=new AtomicInteger();
        var adapter=gateway((request,timeout)->{count.incrementAndGet();return new BailianAiGateway.TransportResponse(200,completion("{\"score\":99}"));},3,3000);
        assertEquals(AiFailure.Code.INVALID_OUTPUT,assertThrows(AiFailure.class,()->adapter.generate(REQUEST)).code());assertEquals(1,count.get());
    }
    @Test void responseLimitEnforcedEvenWithInjectedTransport() {
        var adapter=gateway((request,timeout)->new BailianAiGateway.TransportResponse(200,new byte[32769]),1,3000);
        assertEquals(AiFailure.Code.OUTPUT_LIMIT,assertThrows(AiFailure.class,()->adapter.generate(REQUEST)).code());
    }
    @Test void defaultSpringBeanRemainsFakeWhenKeyExists() {
        var environment=new MockEnvironment().withProperty("BAILIAN_API_KEY",TEST_VALUE).withProperty("MAJORPILOT_AI_PROVIDER","bailian");
        assertInstanceOf(FakeAiGateway.class,new P0AiConfiguration().p0AiGateway(environment));
        environment.withProperty("MAJORPILOT_AI_MODE","bailian");
        assertInstanceOf(BailianAiGateway.class,new P0AiConfiguration().p0AiGateway(environment));
    }
    @Test void realHttpTransportCapsResponseWhileReadingLocalStub() throws Exception {
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/large",exchange->{byte[] bytes=new byte[40000];exchange.sendResponseHeaders(200,bytes.length);try(var out=exchange.getResponseBody()){out.write(bytes);}});
        server.start();
        try {
            HttpRequest request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/large")).GET().build();
            assertEquals(AiFailure.Code.OUTPUT_LIMIT,assertThrows(AiFailure.class,()->new BailianAiGateway.HttpTransport().send(request,2000)).code());
        } finally { server.stop(0); }
    }
    @Test void realHttpTransportDeadlineIncludesSlowBody() throws Exception {
        HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/slow",exchange->{exchange.sendResponseHeaders(200,0);try(var out=exchange.getResponseBody()){out.write('{');out.flush();try{Thread.sleep(500);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}}});
        server.start();
        try {
            HttpRequest request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/slow")).timeout(Duration.ofSeconds(2)).GET().build();
            assertEquals(AiFailure.Code.TIMEOUT,assertThrows(AiFailure.class,()->new BailianAiGateway.HttpTransport().send(request,50)).code());
        } finally { server.stop(0); }
    }
}
