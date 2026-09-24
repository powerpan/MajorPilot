package com.ruoyi.majorpilot.integration.ai;

import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Bounded report transport: a whole-body deadline, no redirects/retries, no supplier text in errors. */
final class ReportHttpTransport implements BailianAiGateway.Transport {
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final int maxBytes;

    ReportHttpTransport(int maxBytes) { this.maxBytes = maxBytes; }

    // JSON string escaping can expand a bounded final text by up to six bytes.
    static long maxEnvelopeBytes(int maxFinalBytes) { return 6L * maxFinalBytes + 4096; }

    @Override public BailianAiGateway.TransportResponse send(HttpRequest request, long timeoutMs) {
        if (timeoutMs < 1 || timeoutMs > ReportModelSettings.MAX_TOTAL_BUDGET_MS) throw new AiFailure(AiFailure.Code.INVALID_INPUT);
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        CompletableFuture<HttpResponse<byte[]>> future = null;
        try {
            boolean streaming = request.headers().firstValue("Accept").orElse("").equals("text/event-stream");
            future = client.sendAsync(request, info -> {
                if (!streaming || info.statusCode() < 200 || info.statusCode() >= 300) return new LimitedBody(maxBytes);
                if (info.headers().firstValue("x-dashscope-partialresponse").orElse("").trim().equalsIgnoreCase("true"))
                    throw new AiFailure(AiFailure.Code.INVALID_OUTPUT);
                String contentType = info.headers().firstValue("Content-Type").orElse("").split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
                if (!contentType.equals("text/event-stream")) throw new AiFailure(AiFailure.Code.INVALID_OUTPUT);
                return new ReportSseBody(maxBytes);
            });
            long left = deadline - System.nanoTime();
            if (left <= 0) throw new TimeoutException();
            var response = future.get(left, TimeUnit.NANOSECONDS);
            return new BailianAiGateway.TransportResponse(response.statusCode(), response.body());
        } catch (TimeoutException ignored) {
            if (future != null) future.cancel(true);
            throw new AiFailure(AiFailure.Code.TIMEOUT);
        } catch (InterruptedException ignored) {
            if (future != null) future.cancel(true);
            Thread.currentThread().interrupt();
            throw new AiFailure(AiFailure.Code.TRANSPORT_FAILED);
        } catch (Exception error) {
            if (future != null) future.cancel(true);
            Throwable cause = error;
            while ((cause instanceof java.util.concurrent.ExecutionException || cause instanceof java.util.concurrent.CompletionException) && cause.getCause() != null)
                cause = cause.getCause();
            if (cause instanceof AiFailure failure) throw new AiFailure(failure.code());
            if (cause instanceof java.net.http.HttpTimeoutException) throw new AiFailure(AiFailure.Code.TIMEOUT);
            throw new AiFailure(AiFailure.Code.TRANSPORT_FAILED);
        }
    }

    static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final int maxBytes;
        private Flow.Subscription subscription;

        LimitedBody(int maxBytes) { this.maxBytes = maxBytes; }
        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(1); }
        @Override public void onNext(List<ByteBuffer> buffers) {
            if (result.isDone()) return;
            for (var buffer : buffers) {
                if ((long) bytes.size() + buffer.remaining() > maxBytes) {
                    subscription.cancel();
                    result.completeExceptionally(new AiFailure(AiFailure.Code.OUTPUT_LIMIT));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable ignored) {
            result.completeExceptionally(new AiFailure(AiFailure.Code.TRANSPORT_FAILED));
        }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
