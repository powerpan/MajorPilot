package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.content.TaskInputValidator;
import com.ruoyi.majorpilot.shared.ApiException;
import com.ruoyi.majorpilot.shared.CanonicalJson;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Bounded, append-only domain rules. Persistence, ownership, locking and idempotency belong to the caller. */
public final class LearningTimeline {
    public enum Kind { SUPPORT_PROVIDED, ATTEMPT_SUBMITTED, BASELINE_SELECTED, CONTINUE_WITH_SUPPORT }
    public enum Role { INITIAL, REVISION, TRANSFER }
    public enum SupportKind { BASIC, HINT_1, HINT_2, HINT_3, RECOVERY }
    public record Support(String supportId, String version, String sha256, SupportKind kind) {
        public Support { key(supportId); key(version); digest(sha256); Objects.requireNonNull(kind); }
    }
    public record Checkpoint(String checkpointId, String stepKey, JsonNode answerSchema, String transferQuestionId,
                             String transferStepKey, JsonNode transferSchema, List<Support> supports) {
        public Checkpoint {
            if (checkpointId == null || !checkpointId.matches("(AI|DS|BA)-C[1-3]")) throw invalidDefinition();
            key(stepKey); TaskInputValidator.validateSchema(answerSchema); answerSchema = answerSchema.deepCopy();
            if (transferQuestionId != null) { key(transferQuestionId); key(transferStepKey); TaskInputValidator.validateSchema(transferSchema); transferSchema = transferSchema.deepCopy(); }
            else if (transferSchema != null || transferStepKey != null) throw invalidDefinition();
            supports = List.copyOf(supports);
            if (supports.size() != 5 || supports.stream().map(Support::supportId).distinct().count() != 5
                || !new HashSet<>(supports.stream().map(Support::kind).toList()).equals(Set.of(SupportKind.values()))) throw invalidDefinition();
        }
        @Override public JsonNode answerSchema() { return answerSchema.deepCopy(); }
        @Override public JsonNode transferSchema() { return transferSchema == null ? null : transferSchema.deepCopy(); }
    }
    public record Definition(String methodVersion, List<Checkpoint> checkpoints) {
        public Definition {
            key(methodVersion); checkpoints = List.copyOf(checkpoints);
            if (checkpoints.size() != 3 || checkpoints.stream().map(Checkpoint::checkpointId).distinct().count() != 3
                || checkpoints.stream().map(Checkpoint::stepKey).distinct().count() != 3
                || checkpoints.stream().filter(c -> c.transferQuestionId() != null).count() != 1) throw invalidDefinition();
            String prefix = checkpoints.getFirst().checkpointId().split("-")[0];
            for (int i = 0; i < 3; i++) if (!checkpoints.get(i).checkpointId().equals(prefix + "-C" + (i + 1))) throw invalidDefinition();
        }
    }
    public record Binding(String runId, String taskVersionId, String taskManifestSha256, String definitionSha256) {
        public Binding {
            for (String value : new String[]{runId, taskVersionId}) if (value == null || !value.matches("[0-7][0-9A-HJKMNP-TV-Z]{25}")) throw invalidDefinition();
            digest(taskManifestSha256); digest(definitionSha256);
        }
    }
    /** Only explicit submitted snapshots use ATTEMPT_SUBMITTED. Draft saves never call this boundary. */
    public record Command(Kind kind, String checkpointId, Role role, JsonNode answer, String responseStepKey, Long responseRevision,
                          String responseSha256, String supportId) {
        public Command { answer = answer == null ? null : answer.deepCopy(); }
        @Override public JsonNode answer() { return answer == null ? null : answer.deepCopy(); }
    }
    public record Event(int sequence, Kind kind, String checkpointId, Instant acceptedAt, JsonNode payload,
                        String previousSha256, String sha256) {
        public Event { payload = payload.deepCopy(); }
        @Override public JsonNode payload() { return payload.deepCopy(); }
    }
    public record Snapshot(String schemaVersion, Binding binding, List<Event> events, String sha256) {
        public Snapshot { events = List.copyOf(events); }
    }
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String ROOT = "0".repeat(64);
    private static final int MAX_EVENTS = 28; // 15 distinct supports, 7 attempts, 3 continuations, with bounded headroom.
    private LearningTimeline() {}

    public static String definitionHash(Definition definition) { return hash(JSON.valueToTree(definition)); }
    public static String answerHash(JsonNode answer) { return hash(answer); }

    /** acceptedAt must come from the server, after the Run/Student lock; no client timestamp is accepted. */
    public static Event append(Binding binding, Definition definition, List<Event> history, int expectedSequence,
                               Command command, Instant acceptedAt) {
        validateHistory(binding, definition, history);
        if (expectedSequence != history.size()) throw new ApiException(409, "LEARNING_SEQUENCE_CONFLICT");
        return create(binding, definition, history, command, acceptedAt);
    }

    /** Freeze inside the same transaction as final responses/reflection. Historical v1 Runs must not call this. */
    public static Snapshot freeze(Binding binding, Definition definition, List<Event> history) {
        validateHistory(binding, definition, history);
        for (Checkpoint checkpoint : definition.checkpoints()) if (!hasAttempt(history, checkpoint.checkpointId(), Role.INITIAL)) throw new ApiException(409, "LEARNING_CHECKPOINT_MISSING");
        var envelope = JSON.createObjectNode().put("schemaVersion", "learning-snapshot-v1");
        envelope.set("binding", JSON.valueToTree(binding)); envelope.set("events", eventNodes(history));
        return new Snapshot("learning-snapshot-v1", binding, history, hash(envelope));
    }

    public static void validateHistory(Binding binding, Definition definition, List<Event> history) {
        if (!binding.definitionSha256().equals(definitionHash(definition)) || history == null || history.size() > MAX_EVENTS) throw sourceInvalid();
        var prefix = new ArrayList<Event>();
        for (Event event : history) {
            try {
                if (event == null || event.sequence() != prefix.size() + 1) throw sourceInvalid();
                JsonNode payload = event.payload(); Command command;
                if (event.kind() == Kind.ATTEMPT_SUBMITTED) command = new Command(event.kind(), event.checkpointId(), Role.valueOf(payload.path("role").asText()), payload.path("answer"), payload.path("responseStepKey").asText(), payload.path("responseRevision").asLong(), payload.path("responseSha256").asText(), null);
                else command = new Command(event.kind(), event.checkpointId(), null, null, null, null, null, event.kind() == Kind.CONTINUE_WITH_SUPPORT ? null : payload.path("supportId").asText());
                Event recreated = create(binding, definition, prefix, command, event.acceptedAt());
                // MySQL JSON normalizes integral nodes (LongNode -> IntNode). Compare the
                // complete canonical wire representation, including both chain hashes,
                // rather than Jackson's implementation-specific numeric node classes.
                if (!hash(eventNodes(List.of(recreated))).equals(hash(eventNodes(List.of(event))))) throw sourceInvalid();
                prefix.add(event);
            } catch (RuntimeException invalid) { throw sourceInvalid(); }
        }
    }

    private static Event create(Binding binding, Definition definition, List<Event> history, Command command, Instant time) {
        if (command == null || command.kind() == null || time == null || history.size() >= MAX_EVENTS) throw invalidCommand();
        if (!time.equals(time.truncatedTo(ChronoUnit.MILLIS)) || !history.isEmpty() && time.isBefore(history.getLast().acceptedAt())) throw invalidCommand();
        Checkpoint checkpoint = definition.checkpoints().stream().filter(c -> c.checkpointId().equals(command.checkpointId())).findFirst().orElseThrow(LearningTimeline::invalidCommand);
        var payload = JSON.createObjectNode();
        if (command.kind() == Kind.ATTEMPT_SUBMITTED) {
            if (command.role() == null || command.answer() == null || command.responseStepKey() == null || command.responseRevision() == null || command.responseRevision() < 1
                || command.supportId() != null || !answerHash(command.answer()).equals(command.responseSha256())) throw invalidCommand();
            if (!command.responseStepKey().equals(command.role() == Role.TRANSFER ? checkpoint.transferStepKey() : checkpoint.stepKey())) throw invalidCommand();
            if (hasAttempt(history, command.checkpointId(), command.role())) throw new ApiException(409, "LEARNING_ATTEMPT_LIMIT");
            if (!hasSupport(history, checkpoint, SupportKind.BASIC)) throw new ApiException(409, "LEARNING_INTRODUCTION_REQUIRED");
            if (command.role() == Role.INITIAL) {
                for (Checkpoint earlier : definition.checkpoints()) {
                    if (earlier.checkpointId().equals(checkpoint.checkpointId())) break;
                    if (!hasAttempt(history, earlier.checkpointId(), Role.INITIAL)) throw new ApiException(409, "LEARNING_PREVIOUS_CHECKPOINT_REQUIRED");
                }
            } else {
                Event initial = history.stream().filter(e -> isAttempt(e, checkpoint.checkpointId(), Role.INITIAL)).findFirst().orElseThrow(() -> new ApiException(409, "LEARNING_INITIAL_REQUIRED"));
                if ((command.role() == Role.REVISION || command.responseStepKey().equals(initial.payload().path("responseStepKey").asText())) && command.responseRevision() <= initial.payload().path("responseRevision").asLong()) throw new ApiException(409, "LEARNING_RESPONSE_STALE");
                if (command.role() == Role.REVISION && hasAttempt(history, checkpoint.checkpointId(), Role.TRANSFER)) throw new ApiException(409, "LEARNING_ATTEMPT_LIMIT");
            }
            if (command.role() == Role.TRANSFER && checkpoint.transferQuestionId() == null) throw invalidCommand();
            TaskInputValidator.validate(command.role() == Role.TRANSFER ? checkpoint.transferSchema() : checkpoint.answerSchema(), command.answer(), true);
            payload.put("role", command.role().name()).put("responseStepKey", command.responseStepKey()).put("responseRevision", command.responseRevision()).put("responseSha256", command.responseSha256());
            payload.put("questionId", command.role() == Role.TRANSFER ? checkpoint.transferQuestionId() : checkpoint.checkpointId());
            payload.set("answer", command.answer());
            var supportSequences = payload.putArray("providedSupportSequences");
            history.stream().filter(e -> e.kind() == Kind.SUPPORT_PROVIDED || e.kind() == Kind.BASELINE_SELECTED).forEach(e -> supportSequences.add(e.sequence()));
        } else {
            if (command.role() != null || command.answer() != null || command.responseStepKey() != null || command.responseRevision() != null || command.responseSha256() != null) throw invalidCommand();
            if (command.kind() == Kind.CONTINUE_WITH_SUPPORT) {
                if (command.supportId() != null || !hasAttempt(history, checkpoint.checkpointId(), Role.INITIAL)) throw invalidCommand();
                if (history.stream().anyMatch(e -> e.checkpointId().equals(checkpoint.checkpointId()) && e.kind() == Kind.CONTINUE_WITH_SUPPORT)) throw new ApiException(409, "LEARNING_CONTINUATION_EXISTS");
                boolean extraHelp = checkpoint.supports().stream().filter(s -> s.kind() != SupportKind.BASIC).anyMatch(s -> hasSupport(history, checkpoint, s.kind()));
                if (!extraHelp) throw new ApiException(409, "LEARNING_SUPPORT_REQUIRED");
                payload.put("choice", "CONTINUE_WITH_SUPPORT");
            } else {
                Support support = checkpoint.supports().stream().filter(s -> s.supportId().equals(command.supportId())).findFirst().orElseThrow(LearningTimeline::invalidCommand);
                if ((command.kind() == Kind.BASELINE_SELECTED) != (support.kind() == SupportKind.RECOVERY)) throw invalidCommand();
                if (hasSupport(history, checkpoint, support.kind())) throw new ApiException(409, "LEARNING_SUPPORT_ALREADY_RECORDED");
                if (support.kind() == SupportKind.RECOVERY && !hasAttempt(history, checkpoint.checkpointId(), Role.INITIAL)) throw new ApiException(409, "LEARNING_INITIAL_REQUIRED");
                payload.put("supportId", support.supportId()).put("supportVersion", support.version()).put("supportSha256", support.sha256()).put("supportKind", support.kind().name());
                payload.put("meaning", command.kind() == Kind.BASELINE_SELECTED ? "SYSTEM_RESULT_SELECTED_NOT_STUDENT_WORK" : "PROVIDED_NOT_PROOF_OF_READING_OR_UNDERSTANDING");
            }
        }
        int sequence = history.size() + 1; String previous = history.isEmpty() ? ROOT : history.getLast().sha256();
        var envelope = JSON.createObjectNode().put("sequence", sequence).put("kind", command.kind().name()).put("checkpointId", command.checkpointId()).put("acceptedAt", time.toString()).put("previousSha256", previous);
        envelope.set("binding", JSON.valueToTree(binding)); envelope.set("payload", payload);
        return new Event(sequence, command.kind(), command.checkpointId(), time, payload, previous, hash(envelope));
    }
    private static boolean hasSupport(List<Event> history, Checkpoint checkpoint, SupportKind kind) {
        return history.stream().anyMatch(e -> e.checkpointId().equals(checkpoint.checkpointId()) && (e.kind() == Kind.SUPPORT_PROVIDED || e.kind() == Kind.BASELINE_SELECTED) && e.payload().path("supportKind").asText().equals(kind.name()));
    }
    private static boolean hasAttempt(List<Event> history, String checkpoint, Role role) { return history.stream().anyMatch(e -> isAttempt(e, checkpoint, role)); }
    private static boolean isAttempt(Event event, String checkpoint, Role role) { return event.kind() == Kind.ATTEMPT_SUBMITTED && event.checkpointId().equals(checkpoint) && event.payload().path("role").asText().equals(role.name()); }
    private static JsonNode eventNodes(List<Event> history) {
        var array = JSON.createArrayNode();
        for (Event event : history) {
            var node = array.addObject().put("sequence",event.sequence()).put("kind",event.kind().name()).put("checkpointId",event.checkpointId()).put("acceptedAt",event.acceptedAt().toString()).put("previousSha256",event.previousSha256()).put("sha256",event.sha256());
            node.set("payload",event.payload());
        }
        return array;
    }
    private static String hash(JsonNode node) { return CanonicalJson.hash(JSON, node); }
    private static void key(String value) { if (value == null || !value.matches("[a-z][a-z0-9-]{0,79}")) throw invalidDefinition(); }
    private static void digest(String value) { if (value == null || !value.matches("[a-f0-9]{64}")) throw invalidDefinition(); }
    private static ApiException invalidDefinition() { return new ApiException(422, "LEARNING_DEFINITION_INVALID"); }
    private static ApiException invalidCommand() { return new ApiException(422, "LEARNING_SUBMISSION_INVALID"); }
    private static ApiException sourceInvalid() { return new ApiException(409, "LEARNING_SOURCE_INVALID"); }
}
