package com.ruoyi.majorpilot.integration.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import static org.junit.jupiter.api.Assertions.*;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/** Real loopback HTTP plus byte-boundary parser tests; never uses a supplier or a key. */
class ReportSseTransportTest {
    static final ObjectMapper JSON = new ObjectMapper();
    static String event(Object value) throws Exception { return "data: " + JSON.writeValueAsString(value) + "\n\n"; }
    static String delta(Map<String,Object> value, String finish) throws Exception {
        var choice = new LinkedHashMap<String,Object>(); choice.put("index",0); choice.put("delta",value); choice.put("finish_reason",finish);
        return event(Map.of("object","chat.completion.chunk","choices",List.of(choice)));
    }
    static String usage() throws Exception { return event(Map.of("choices",List.of(),"usage",Map.of("prompt_tokens",16500,"completion_tokens",8443,"completion_tokens_details",Map.of("reasoning_tokens",2739),"private_supplier_field","PRIVATE_USAGE_SENTINEL"))); }
    static String good() throws Exception {
        return ": heartbeat\n\n" + delta(Map.of("role","assistant","reasoning_content","PRIVATE_REASONING_SENTINEL"),null)
                + delta(Map.of("content","{\"分析\":\"真实"),null) + delta(Map.of("content","引用🧭\"}"),"stop") + usage() + "data: [DONE]\n\n";
    }
    static final class Subscription implements Flow.Subscription {
        int requested, cancelled;
        public void request(long count) { assertEquals(1,count); requested++; }
        public void cancel() { cancelled++; }
    }
    static byte[] parsed(ReportSseBody body, byte[] bytes, int stride) throws Exception {
        body.onSubscribe(new Subscription());
        for (int i=0;i<bytes.length;i+=stride) body.onNext(List.of(ByteBuffer.wrap(Arrays.copyOfRange(bytes,i,Math.min(bytes.length,i+stride)))));
        body.onComplete(); return body.getBody().toCompletableFuture().get(2,TimeUnit.SECONDS);
    }
    static void rejected(String value, AiFailure.Code code) {
        var failure=assertThrows(ExecutionException.class,()->parsed(new ReportSseBody(1_048_576),value.getBytes(StandardCharsets.UTF_8),3));
        assertEquals(code,((AiFailure)failure.getCause()).code()); assertEquals(code.name(),failure.getCause().getMessage());
    }
    interface AtServer<T> { T run(URI uri) throws Exception; }
    static <T> T server(HttpHandler handler, AtServer<T> test) throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var executor=Executors.newCachedThreadPool(r->{var t=new Thread(r,"report-sse-loopback");t.setDaemon(true);return t;});
        server.setExecutor(executor);server.createContext("/report",handler);server.start();
        try{return test.run(URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/report"));}
        finally{server.stop(0);executor.shutdownNow();}
    }
    static HttpRequest request(URI uri,long timeout){return HttpRequest.newBuilder(uri).header("Accept","text/event-stream").timeout(Duration.ofMillis(timeout)).build();}

    @Test void arbitraryUtf8AndCrlfBoundariesPreserveOnlyFinalContentAndSafeUsage() throws Exception {
        for (int stride:List.of(1,2,17,8192)) for(String delimiter:List.of("\n","\r\n","\r")) {
            byte[] result=parsed(new ReportSseBody(1_048_576),good().replace("\n",delimiter).getBytes(StandardCharsets.UTF_8),stride);
            var envelope=JSON.readTree(result);
            assertEquals("{\"分析\":\"真实引用🧭\"}",envelope.at("/choices/0/message/content").asText());
            assertEquals("stop",envelope.at("/choices/0/finish_reason").asText());
            assertEquals(2739,envelope.at("/usage/completion_tokens_details/reasoning_tokens").asInt());
            assertEquals(16500,envelope.at("/usage/prompt_tokens").asInt());
            assertFalse(new String(result,StandardCharsets.UTF_8).contains("PRIVATE_"));
        }
    }
    @Test void rejectsMissingTerminationMalformedFramesDuplicatesErrorsAndInvalidChoices() throws Exception {
        String content=delta(Map.of("content","{}"),null),stop=delta(Map.of(),"stop"),done="data: [DONE]\n\n";
        for(String bad:List.of(content,content+stop,content+done,done,content+stop+done+done,good()+content,
                "data: PRIVATE_PROVIDER_ERROR\n\n", "event: error\ndata: {}\n\n", "data: {\"error\":{\"message\":\"PRIVATE_ERROR\"}}\n\n",
                "data: {\"choices\":[],\"choices\":[]}\n\n", "data: {} {}\n\n", "data: [DONE]",
                event(Map.of("choices",List.of(Map.of("index",4294967296L,"delta",Map.of("content","{}"),"finish_reason","stop"))))+done,
                event(Map.of("choices",List.of(Map.of("index",1,"delta",Map.of("content","{}"),"finish_reason","stop"))))+done,
                event(Map.of("choices",List.of(Map.of("index",0,"delta",Map.of()),Map.of("index",1,"delta",Map.of())))),
                delta(Map.of("tool_calls",List.of(Map.of("name","unsafe"))),"stop")+done,
                delta(Map.of("content",List.of("wrong type")),"stop")+done,
                delta(Map.of("reasoning_content",Map.of("private","wrong type")),null),
                content+delta(Map.of(),"content_filter")+done,
                content+stop+usage()+usage()+done,
                content+stop+event(Map.of("choices",List.of(),"usage",Map.of("prompt_tokens",-1,"completion_tokens",3)))+done))
            rejected(bad,AiFailure.Code.INVALID_OUTPUT);
        rejected(content+delta(Map.of(),"length")+done,AiFailure.Code.OUTPUT_LIMIT);
    }
    @Test void malformedUtf8IsNotReplacedSilently() {
        var bytes=new byte[]{'d','a','t','a',':',' ',(byte)0xc3,0x28,'\n','\n'};
        var failure=assertThrows(ExecutionException.class,()->parsed(new ReportSseBody(100),bytes,1));
        assertEquals(AiFailure.Code.INVALID_OUTPUT,((AiFailure)failure.getCause()).code());
    }
    @Test void wireFrameCountAndFinalTextHaveIndependentHardLimits() throws Exception {
        String content=delta(Map.of("content","x".repeat(101)),"stop")+"data: [DONE]\n\n";
        for(var sample:List.of(new Object[]{new ReportSseBody(100),content},
                new Object[]{new ReportSseBody(1000,30,1000,100),": "+"x".repeat(31)+"\n\n"},
                new Object[]{new ReportSseBody(1000,100,40,100),": "+"x".repeat(20)+"\n\n: "+"x".repeat(20)+"\n\n"},
                new Object[]{new ReportSseBody(1000,100,1000,2),": a\n\n: b\n\n: c\n\n"})) {
            var failure=assertThrows(ExecutionException.class,()->parsed((ReportSseBody)sample[0],((String)sample[1]).getBytes(StandardCharsets.UTF_8),1));
            assertEquals(AiFailure.Code.OUTPUT_LIMIT,((AiFailure)failure.getCause()).code());
        }
    }
    @Test void actualHttpStreamsManySmallChunksAndDiscardsReasoning() throws Exception {
        var hits=new AtomicInteger();byte[] wire=good().getBytes(StandardCharsets.UTF_8);
        var response=server(exchange->{hits.incrementAndGet();try(exchange){exchange.getResponseHeaders().set("Content-Type","text/event-stream; charset=utf-8");exchange.sendResponseHeaders(200,0);for(int i=0;i<wire.length;i+=7){exchange.getResponseBody().write(wire,i,Math.min(7,wire.length-i));exchange.getResponseBody().flush();}}},uri->new ReportHttpTransport(1_048_576).send(request(uri,3000),3000));
        assertEquals(1,hits.get());assertEquals(200,response.status());
        assertEquals("{\"分析\":\"真实引用🧭\"}",JSON.readTree(response.body()).at("/choices/0/message/content").asText());
        assertFalse(new String(response.body(),StandardCharsets.UTF_8).contains("PRIVATE_"));
    }
    @Test void actualHttpRejectsEofPartialResponseWrongContentTypeAndErrorWithoutRetry() throws Exception {
        for(String kind:List.of("EOF","PARTIAL","TYPE","ERROR")) {
            var hits=new AtomicInteger();String text=kind.equals("EOF")?delta(Map.of("content","{}"),"stop"):kind.equals("ERROR")?"data: {\"error\":{\"message\":\"PRIVATE_SENTINEL\"}}\n\n":good();
            var failure=server(exchange->{hits.incrementAndGet();try(exchange){exchange.getResponseHeaders().set("Content-Type",kind.equals("TYPE")?"application/json":"text/event-stream");if(kind.equals("PARTIAL"))exchange.getResponseHeaders().set("x-dashscope-partialresponse","true");byte[] bytes=text.getBytes(StandardCharsets.UTF_8);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);}},uri->assertThrows(AiFailure.class,()->new ReportHttpTransport(1_048_576).send(request(uri,3000),3000)));
            assertEquals(AiFailure.Code.INVALID_OUTPUT,failure.code(),kind);assertEquals(1,hits.get());assertFalse(failure.toString().contains("PRIVATE_"));
        }
    }
    @Test void actualHttpDeadlineCoversHeadersBodyAndEofAfterDone() throws Exception {
        for(String stage:List.of("BEFORE_HEADERS","DURING_BODY","AFTER_DONE")) {
            var hits=new AtomicInteger();String prefix=stage.equals("AFTER_DONE")?good():delta(Map.of("reasoning_content","PRIVATE_STILL_THINKING"),null);
            long started=System.nanoTime();
            var failure=server(exchange->{hits.incrementAndGet();try(exchange){if(!stage.equals("BEFORE_HEADERS")){exchange.getResponseHeaders().set("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);exchange.getResponseBody().write(prefix.getBytes(StandardCharsets.UTF_8));exchange.getResponseBody().flush();}try{Thread.sleep(2000);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}}},uri->assertThrows(AiFailure.class,()->new ReportHttpTransport(1_048_576).send(request(uri,250),250)));
            assertEquals(AiFailure.Code.TIMEOUT,failure.code(),stage);assertEquals(1,hits.get());
            assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started)<1800,"No unbounded body wait: "+stage);
        }
    }
    @Test void actualHttpOutputLimitsCancelRatherThanAccumulatingOrRetrying() throws Exception {
        for(String kind:List.of("FINAL","FRAME")) {
            String value=kind.equals("FINAL")?delta(Map.of("content","x".repeat(101)),"stop"):"data: "+"x".repeat(ReportSseBody.MAX_FRAME_BYTES+1);
            var hits=new AtomicInteger();
            var failure=server(exchange->{hits.incrementAndGet();try(exchange){exchange.getResponseHeaders().set("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);try{exchange.getResponseBody().write(value.getBytes(StandardCharsets.UTF_8));}catch(java.io.IOException expectedCancellation){}}},uri->assertThrows(AiFailure.class,()->new ReportHttpTransport(100).send(request(uri,3000),3000)));
            assertEquals(AiFailure.Code.OUTPUT_LIMIT,failure.code(),kind);assertEquals(1,hits.get());
        }
    }
    @Test void nonStreamingAndHttpErrorStatusesKeepTheExistingTransportContract() throws Exception {
        for(int status:List.of(200,429,500)) {
            byte[] expected="{\"choices\":[],\"sentinel\":\"legacy envelope\"}".getBytes(StandardCharsets.UTF_8);
            var response=server(exchange->{try(exchange){exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(status,expected.length);exchange.getResponseBody().write(expected);}},uri->new ReportHttpTransport(1000).send(status==200?HttpRequest.newBuilder(uri).build():request(uri,3000),3000));
            assertEquals(status,response.status());assertArrayEquals(expected,response.body());
        }
    }
}
