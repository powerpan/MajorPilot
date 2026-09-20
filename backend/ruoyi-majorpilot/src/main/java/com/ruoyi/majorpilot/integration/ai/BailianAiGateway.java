package com.ruoyi.majorpilot.integration.ai;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Server-only synthetic adapter. Opt-in live bean; no automatic startup request, no user free text. */
public final class BailianAiGateway implements AiGateway {
    public static final String DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    public static final String DEFAULT_MODEL = "qwen3.7-plus";
    private static final ObjectMapper JSON = new ObjectMapper();
    private final URI endpoint;
    private final String key;
    private final String model;
    private final Transport transport;
    private final int maxAttempts;
    private final long deadlineMs;
    private final long requestTimeoutMs;
    private final Sleeper sleeper;

    public BailianAiGateway(String key, String baseUrl, String model) {
        this(key, baseUrl, model, new HttpTransport(), 2, 30000, 15000, Thread::sleep);
    }
    BailianAiGateway(String key, String baseUrl, String model, Transport transport, int maxAttempts, long deadlineMs, long requestTimeoutMs, Sleeper sleeper) {
        this.endpoint = validateEndpoint(baseUrl);
        if (key == null || key.isBlank() || key.matches("(?s).*\\s.*") || model == null || !model.matches("qwen[a-z0-9.-]{0,80}") || maxAttempts < 1 || maxAttempts > 3 || deadlineMs < 1 || deadlineMs > 45000 || requestTimeoutMs < 1) throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
        this.key = key; this.model = model; this.transport = transport; this.maxAttempts = maxAttempts;
        this.deadlineMs = deadlineMs; this.requestTimeoutMs = requestTimeoutMs; this.sleeper = sleeper;
    }

    static URI validateEndpoint(String baseUrl) {
        try {
            URI uri = URI.create(baseUrl);
            String host = uri.getHost();
            if (!"https".equals(uri.getScheme()) || host == null || !(host.equals("dashscope.aliyuncs.com") || host.matches("[a-z0-9][a-z0-9-]{0,62}\\.cn-beijing\\.maas\\.aliyuncs\\.com")) || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().replaceAll("/$", "").equals("/compatible-mode/v1")) throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
            return URI.create("https://" + host + "/compatible-mode/v1/chat/completions");
        } catch (Exception ignored) { throw new AiFailure(AiFailure.Code.CONFIG_INVALID); }
    }

    @Override public Response generate(Request request) {
        if (request == null) throw new AiFailure(AiFailure.Code.INVALID_INPUT);
        long started = System.nanoTime();
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            long remaining = deadlineMs - elapsed(started);
            if (remaining <= 0) throw new AiFailure(AiFailure.Code.TIMEOUT);
            try {
                HttpRequest http = HttpRequest.newBuilder(endpoint).timeout(Duration.ofMillis(Math.min(requestTimeoutMs,remaining)))
                    .header("Authorization", "Bearer " + key).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body(request))).build();
                TransportResponse raw = transport.send(http, Math.min(requestTimeoutMs,remaining));
                if (raw.status() < 200 || raw.status() >= 300) throw new AiFailure(classify(raw.status()));
                if (raw.body().length > 32768) throw new AiFailure(AiFailure.Code.OUTPUT_LIMIT);
                JsonNode value = JSON.readTree(raw.body()); JsonNode choice = value.path("choices").path(0);
                if (!"stop".equals(choice.path("finish_reason").asText()) || !choice.path("message").path("content").isTextual()) throw new AiFailure(AiFailure.Code.INVALID_OUTPUT);
                Payload payload = AiResultValidator.validate(choice.path("message").path("content").textValue());
                return new Response(payload, new Metadata("BAILIAN", model, attempt, elapsed(started), tokens(value,"prompt_tokens"), tokens(value,"completion_tokens")));
            } catch (AiFailure failure) {
                boolean retryable = failure.code() == AiFailure.Code.TIMEOUT || failure.code() == AiFailure.Code.RATE_LIMITED || failure.code() == AiFailure.Code.UPSTREAM_UNAVAILABLE;
                if (!retryable || attempt == maxAttempts) throw failure;
                long delay = ThreadLocalRandom.current().nextLong(100,201) * attempt;
                if (elapsed(started) + delay >= deadlineMs) throw new AiFailure(AiFailure.Code.TIMEOUT);
                try { sleeper.sleep(delay); }
                catch (InterruptedException ignored) { Thread.currentThread().interrupt(); throw new AiFailure(AiFailure.Code.TRANSPORT_FAILED); }
            } catch (Exception ignored) { throw new AiFailure(AiFailure.Code.INVALID_OUTPUT); }
        }
        throw new AiFailure(AiFailure.Code.UPSTREAM_UNAVAILABLE);
    }

    private static long elapsed(long start) { return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start); }
    private static long tokens(JsonNode value,String field) { JsonNode node=value.path("usage").path(field); return node.canConvertToLong() && node.isIntegralNumber() && node.longValue() >= 0 ? node.longValue() : 0; }
    private static AiFailure.Code classify(int status) {
        if (status == 401 || status == 403) return AiFailure.Code.AUTH_FAILED;
        if (status == 429) return AiFailure.Code.RATE_LIMITED;
        if (status >= 500) return AiFailure.Code.UPSTREAM_UNAVAILABLE;
        return AiFailure.Code.UPSTREAM_REJECTED;
    }
    private String body(Request request) throws Exception {
        return JSON.writeValueAsString(Map.of("model",model,"stream",false,"enable_thinking",false,"temperature",0,"max_tokens",512,"response_format",Map.of("type","json_object"),"messages",List.of(
            Map.of("role","system","content","这是合成数据接口测试，不是学生报告。只返回 JSON 对象 schemaVersion、major、evidenceIds、explanation；不能给适配分数、录取概率、人格判断、外部链接或未提供的事实。"),
            Map.of("role","user","content","P0 workload=" + request.workload().name() + "; prompt=" + request.promptVersion() + "。规则固定 DATA_SCIENCE。唯一合成证据 synthetic_ev_1：测试用户想先尝试数据清理。schemaVersion=p0-ai-v1，major=DATA_SCIENCE，evidenceIds=[synthetic_ev_1]。explanation 用一句简短中文说明这是体验顺序建议，不是适合程度判断。"))));
    }

    interface Transport { TransportResponse send(HttpRequest request,long timeoutMs); }
    interface Sleeper { void sleep(long millis) throws InterruptedException; }
    record TransportResponse(int status,byte[] body) {}

    /** Never follows redirects; caps bytes while streaming, and deadline includes the entire body. */
    static final class HttpTransport implements Transport {
        private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
        @Override public TransportResponse send(HttpRequest request,long timeoutMs) {
            var future=client.sendAsync(request, info -> new LimitedBody());
            try {
                HttpResponse<byte[]> response=future.get(timeoutMs,TimeUnit.MILLISECONDS);
                return new TransportResponse(response.statusCode(),response.body());
            } catch (TimeoutException ignored) { future.cancel(true); throw new AiFailure(AiFailure.Code.TIMEOUT); }
            catch (InterruptedException ignored) { future.cancel(true); Thread.currentThread().interrupt(); throw new AiFailure(AiFailure.Code.TRANSPORT_FAILED); }
            catch (Exception error) {
                future.cancel(true);
                Throwable reason=error.getCause();
                if (reason instanceof AiFailure failure) throw new AiFailure(failure.code());
                if (reason instanceof java.net.http.HttpTimeoutException) throw new AiFailure(AiFailure.Code.TIMEOUT);
                throw new AiFailure(AiFailure.Code.TRANSPORT_FAILED);
            }
        }
    }

    static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result=new CompletableFuture<>();
        private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription value) { subscription=value; subscription.request(1); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer:buffers) {
                if (bytes.size() + buffer.remaining() > 32768) { subscription.cancel(); result.completeExceptionally(new AiFailure(AiFailure.Code.OUTPUT_LIMIT)); return; }
                byte[] chunk=new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable ignored) { result.completeExceptionally(new AiFailure(AiFailure.Code.TRANSPORT_FAILED)); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
