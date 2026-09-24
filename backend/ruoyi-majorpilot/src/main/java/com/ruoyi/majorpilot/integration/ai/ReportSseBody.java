package com.ruoyi.majorpilot.integration.ai;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;

/** Report-only SSE decoder. Reasoning exists for one bounded frame and is never accumulated or returned. */
final class ReportSseBody implements HttpResponse.BodySubscriber<byte[]> {
    static final int MAX_FRAME_BYTES = 262_144;
    static final long MAX_WIRE_BYTES = 16L * 1_048_576;
    static final int MAX_FRAMES = 100_000;
    private static final ObjectMapper JSON = new ObjectMapper();
    private final CompletableFuture<byte[]> result = new CompletableFuture<>();
    private final int maxFinalBytes, maxFrameBytes, maxFrames;
    private final long maxWireBytes;
    private final ByteArrayOutputStream content = new ByteArrayOutputStream();
    private ByteArrayOutputStream line = new ByteArrayOutputStream();
    private StringBuilder data = new StringBuilder();
    private Flow.Subscription subscription;
    private long wireBytes;
    private int frameBytes, frames;
    private boolean previousCr, hasData, finished, done;
    private JsonNode usage;

    ReportSseBody(int maxFinalBytes) { this(maxFinalBytes, MAX_FRAME_BYTES, MAX_WIRE_BYTES, MAX_FRAMES); }
    ReportSseBody(int maxFinalBytes, int maxFrameBytes, long maxWireBytes, int maxFrames) {
        if (maxFinalBytes < 1 || maxFrameBytes < 1 || maxWireBytes < 1 || maxFrames < 1)
            throw new AiFailure(AiFailure.Code.CONFIG_INVALID);
        this.maxFinalBytes = maxFinalBytes; this.maxFrameBytes = maxFrameBytes;
        this.maxWireBytes = maxWireBytes; this.maxFrames = maxFrames;
    }

    @Override public CompletionStage<byte[]> getBody() { return result; }
    @Override public void onSubscribe(Flow.Subscription value) {
        if (subscription != null || result.isDone()) { value.cancel(); return; }
        subscription = value; value.request(1);
    }
    @Override public void onNext(List<ByteBuffer> buffers) {
        if (result.isDone()) return;
        try {
            for (var buffer : buffers) {
                wireBytes += buffer.remaining();
                if (wireBytes > maxWireBytes) throw new AiFailure(AiFailure.Code.OUTPUT_LIMIT);
                while (buffer.hasRemaining()) accept(buffer.get());
            }
            subscription.request(1);
        } catch (AiFailure failure) { fail(failure.code()); }
        catch (Exception ignored) { fail(AiFailure.Code.INVALID_OUTPUT); }
    }
    private void accept(byte value) throws Exception {
        if (++frameBytes > maxFrameBytes) throw new AiFailure(AiFailure.Code.OUTPUT_LIMIT);
        if (previousCr) { previousCr = false; if (value == '\n') return; }
        if (value == '\r' || value == '\n') {
            previousCr = value == '\r';
            var bytes = line.toByteArray(); line = new ByteArrayOutputStream();
            if (bytes.length == 0) {
                if (++frames > maxFrames) throw new AiFailure(AiFailure.Code.OUTPUT_LIMIT);
                dispatch(); frameBytes = 0;
            } else acceptLine(decode(bytes));
        } else line.write(value);
    }
    private void acceptLine(String value) {
        if (value.startsWith(":")) return; // Bounded SSE heartbeat/comment, not model output.
        int colon = value.indexOf(':');
        String field = colon < 0 ? value : value.substring(0, colon);
        String payload = colon < 0 ? "" : value.substring(colon + 1);
        if (payload.startsWith(" ")) payload = payload.substring(1);
        switch (field) {
            case "data" -> {
                if (hasData) data.append('\n');
                data.append(payload); hasData = true;
            }
            case "event" -> { if (!payload.isEmpty() && !payload.equals("message")) throw invalid(); }
            case "id" -> { if (payload.indexOf('\0') >= 0) throw invalid(); }
            case "retry" -> { if (!payload.matches("[0-9]{1,10}")) throw invalid(); } // Never reconnect or retry.
            default -> throw invalid();
        }
    }
    private void dispatch() throws Exception {
        if (!hasData) return;
        String payload = data.toString(); data = new StringBuilder(); hasData = false;
        if (done) throw invalid();
        if (payload.equals("[DONE]")) {
            if (!finished || content.size() == 0) throw invalid();
            done = true; return;
        }
        JsonNode chunk = JSON.reader().with(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(payload);
        if (chunk == null || !chunk.isObject() || chunk.hasNonNull("error")) throw invalid();
        if (chunk.hasNonNull("object") && (!chunk.path("object").isTextual() || !chunk.path("object").asText().equals("chat.completion.chunk"))) throw invalid();
        var choices = chunk.path("choices");
        if (!choices.isArray() || choices.size() > 1) throw invalid();
        if (chunk.hasNonNull("usage")) captureUsage(chunk.path("usage"));
        if (choices.isEmpty()) { if (!chunk.hasNonNull("usage")) throw invalid(); return; }
        if (finished) throw invalid();
        var choice = choices.get(0);
        if (!choice.isObject() || !choice.path("index").isIntegralNumber() || !choice.path("index").canConvertToInt() || choice.path("index").asInt(-1) != 0) throw invalid();
        var delta = choice.path("delta");
        if (!delta.isObject()) throw invalid();
        for (var fields = delta.fieldNames(); fields.hasNext();)
            if (!Set.of("role", "content", "reasoning_content").contains(fields.next())) throw invalid();
        if (delta.hasNonNull("role") && (!delta.path("role").isTextual() || !delta.path("role").asText().equals("assistant"))) throw invalid();
        if (delta.hasNonNull("reasoning_content") && !delta.path("reasoning_content").isTextual()) throw invalid();
        // Do not append, serialize, log or otherwise retain reasoning_content.
        if (delta.hasNonNull("content")) {
            if (!delta.path("content").isTextual()) throw invalid();
            var bytes = encode(delta.path("content").asText());
            if ((long) content.size() + bytes.remaining() > maxFinalBytes) throw new AiFailure(AiFailure.Code.OUTPUT_LIMIT);
            byte[] addition = new byte[bytes.remaining()]; bytes.get(addition); content.writeBytes(addition);
        }
        var finish = choice.path("finish_reason");
        if (!finish.isMissingNode() && !finish.isNull()) {
            if (finish.asText().equals("length")) throw new AiFailure(AiFailure.Code.OUTPUT_LIMIT);
            if (!finish.isTextual() || !finish.asText().equals("stop")) throw invalid();
            finished = true;
        }
    }
    private void captureUsage(JsonNode value) {
        if (usage != null || !value.isObject()) throw invalid();
        var safe = JSON.createObjectNode();
        for (String key : List.of("prompt_tokens", "completion_tokens")) {
            var token = value.path(key);
            if (!token.isIntegralNumber() || !token.canConvertToLong() || token.asLong() < 0) throw invalid();
            safe.put(key, token.asLong());
        }
        var reasoning = value.at("/completion_tokens_details/reasoning_tokens");
        if (!reasoning.isMissingNode() && !reasoning.isNull()) {
            if (!reasoning.isIntegralNumber() || !reasoning.canConvertToLong() || reasoning.asLong() < 0) throw invalid();
            safe.putObject("completion_tokens_details").put("reasoning_tokens", reasoning.asLong());
        }
        usage = safe;
    }
    @Override public void onError(Throwable failure) {
        fail(failure instanceof java.net.http.HttpTimeoutException ? AiFailure.Code.TIMEOUT : AiFailure.Code.TRANSPORT_FAILED);
    }
    @Override public void onComplete() {
        if (result.isDone()) return;
        try {
            if (!done || !finished || line.size() != 0 || hasData) throw invalid();
            String finalText = decode(content.toByteArray());
            if (finalText.isBlank()) throw invalid();
            var envelope = JSON.createObjectNode();
            var choice = envelope.putArray("choices").addObject(); choice.put("finish_reason", "stop");
            choice.putObject("message").put("content", finalText);
            if (usage != null) envelope.set("usage", usage);
            result.complete(JSON.writeValueAsBytes(envelope));
        } catch (AiFailure failure) { fail(failure.code()); }
        catch (Exception ignored) { fail(AiFailure.Code.INVALID_OUTPUT); }
        finally { clear(); }
    }
    private void fail(AiFailure.Code code) {
        boolean changed = result.completeExceptionally(new AiFailure(code));
        if (changed && subscription != null) subscription.cancel();
        clear();
    }
    private void clear() { line = new ByteArrayOutputStream(); data = new StringBuilder(); content.reset(); usage = null; }
    private static AiFailure invalid() { return new AiFailure(AiFailure.Code.INVALID_OUTPUT); }
    private static String decode(byte[] value) throws CharacterCodingException {
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(value)).toString();
    }
    private static ByteBuffer encode(String value) throws CharacterCodingException {
        return StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).encode(CharBuffer.wrap(value));
    }
}
