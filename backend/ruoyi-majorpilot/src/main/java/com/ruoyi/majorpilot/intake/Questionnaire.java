package com.ruoyi.majorpilot.intake;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import static com.ruoyi.majorpilot.intake.DecisionAnswers.*;

/** The server owns the version and field/enum allowlists, not browser-supplied scores. */
public final class Questionnaire {
    public static final String VERSION = "decision-profile-v1";
    public static final int PAGE_COUNT = 12;
    public static final int REQUIRED_PAGE_COUNT = 10;
    private static final ObjectMapper JSON = new ObjectMapper();
    public static final List<String> KEYS = List.of("applicationStage", "targetIntakeWindow", "targetRegions", "currentField", "currentFieldText", "consideredMajors", "majorFamiliarity", "foundationSelfView", "scenarioPreference", "workElements", "decisionUncertainties", "mainQuestion", "acquisitionChannel");
    public static final List<List<String>> PAGE_KEYS = List.of(
        List.of(KEYS.get(0)), List.of(KEYS.get(1)), List.of(KEYS.get(2)), List.of(KEYS.get(3)),
        List.of(KEYS.get(4)), List.of(KEYS.get(5)), List.of(KEYS.get(6)), List.of(KEYS.get(7)),
        List.of(KEYS.get(8)), List.of(KEYS.get(9)), List.of(KEYS.get(10)), List.of(KEYS.get(11), KEYS.get(12)));
    private Questionnaire() {}

    public static final class Invalid extends RuntimeException {
        private final String field;
        public Invalid(String field) { super("Invalid questionnaire field"); this.field = field; }
        public String field() { return field; }
    }
    public static void version(String version) {
        if (!VERSION.equals(version)) throw new Invalid("questionnaireVersion");
    }
    public static ObjectNode draft(JsonNode supplied) {
        if (supplied == null || !supplied.isObject()) throw new Invalid("answers");
        ObjectNode result = JSON.createObjectNode();
        supplied.fields().forEachRemaining(field -> {
            if (!KEYS.contains(field.getKey())) throw new Invalid("answers");
            if (field.getValue().isNull()) result.set(field.getKey(), field.getValue());
            else result.set(field.getKey(), JSON.valueToTree(value(field.getKey(), field.getValue(), false)));
        });
        return result;
    }
    public static DecisionAnswers complete(JsonNode supplied) {
        ObjectNode normalized = draft(supplied);
        for (String field : KEYS) {
            if (Set.of("currentFieldText", "mainQuestion", "acquisitionChannel").contains(field)) continue;
            if (!normalized.hasNonNull(field)) throw new Invalid(field);
        }
        if (!normalized.hasNonNull("acquisitionChannel")) normalized.put("acquisitionChannel", AcquisitionChannel.DECLINED.name());
        normalized.fields().forEachRemaining(field -> { if (!field.getValue().isNull()) value(field.getKey(),field.getValue(),true); });
        try { return JSON.treeToValue(normalized, DecisionAnswers.class); }
        catch (Exception invalid) { throw new Invalid("answers"); }
    }
    public static ObjectNode json(DecisionAnswers answers) { return JSON.valueToTree(answers); }
    public static int pageNumber(String stepKey) {
        if (stepKey == null || !stepKey.matches("step-(?:[1-9]|1[0-2])")) throw new Invalid("stepKey");
        return Integer.parseInt(stepKey.substring(5));
    }
    public static ObjectNode pageDraft(String stepKey, JsonNode supplied) {
        int page = pageNumber(stepKey);
        ObjectNode value = draft(supplied);
        value.fieldNames().forEachRemaining(key -> { if (!PAGE_KEYS.get(page - 1).contains(key)) throw new Invalid("answers"); });
        return value;
    }
    private static Object value(String key, JsonNode node, boolean complete) {
        return switch (key) {
            case "applicationStage" -> enumeration(node, ApplicationStage.class, key);
            case "targetIntakeWindow" -> enumeration(node, TargetIntakeWindow.class, key);
            case "targetRegions" -> enumerationList(node, TargetRegion.class, complete ? 1 : 0, 3, key);
            case "currentField" -> enumeration(node, CurrentField.class, key);
            case "currentFieldText" -> text(node, 80, key);
            case "consideredMajors" -> enumerationList(node, Major.class, complete ? 1 : 0, 3, key);
            case "majorFamiliarity" -> matrix(node, Major.class, Familiarity.class, key, complete);
            case "foundationSelfView" -> matrix(node, FoundationArea.class, FoundationLevel.class, key, complete);
            case "scenarioPreference" -> scenarios(node, complete);
            case "workElements" -> enumerationList(node, WorkElement.class, complete ? 1 : 0, 3, key);
            case "decisionUncertainties" -> enumerationList(node, DecisionUncertainty.class, complete ? 1 : 0, 2, key);
            case "mainQuestion" -> text(node, 300, key);
            case "acquisitionChannel" -> enumeration(node, AcquisitionChannel.class, key);
            default -> throw new Invalid("answers");
        };
    }
    public static String text(JsonNode node, int max, String field) {
        if (!node.isTextual()) throw new Invalid(field);
        String value = Normalizer.normalize(node.textValue().strip(), Normalizer.Form.NFC);
        if (value.codePointCount(0, value.length()) > max || value.codePoints().anyMatch(c -> Character.isISOControl(c) && c != '\n' && c != '\t')) throw new Invalid(field);
        return value;
    }
    private static <E extends Enum<E>> E enumeration(JsonNode value, Class<E> type, String field) {
        if (!value.isTextual()) throw new Invalid(field);
        try { return Enum.valueOf(type, value.textValue()); }
        catch (IllegalArgumentException bad) { throw new Invalid(field); }
    }
    private static <E extends Enum<E>> List<E> enumerationList(JsonNode value, Class<E> type, int min, int max, String field) {
        if (!value.isArray() || value.size() < min || value.size() > max) throw new Invalid(field);
        List<E> result = new ArrayList<>();
        for (JsonNode item : value) result.add(enumeration(item, type, field));
        if (new HashSet<>(result).size() != result.size()) throw new Invalid(field);
        // Multi-select order is not an answer; canonical order makes request fingerprints stable.
        result.sort(Enum::compareTo);
        return List.copyOf(result);
    }
    private static <K extends Enum<K>, V extends Enum<V>> Map<K,V> matrix(JsonNode value, Class<K> keys, Class<V> values, String field, boolean complete) {
        if (!value.isObject() || value.size() > keys.getEnumConstants().length || (complete && value.size() != keys.getEnumConstants().length)) throw new Invalid(field);
        Map<K,V> result = new EnumMap<>(keys);
        value.fieldNames().forEachRemaining(key -> { try { Enum.valueOf(keys,key); } catch(IllegalArgumentException unknown) { throw new Invalid(field); } });
        for (K key : keys.getEnumConstants()) {
            JsonNode answer = value.get(key.name());
            if (answer == null) { if(complete)throw new Invalid(field); else continue; }
            result.put(key, enumeration(answer, values, field));
        }
        return result;
    }
    private static List<ScenarioRank> scenarios(JsonNode value, boolean complete) {
        if (!value.isArray() || value.size() > 3 || (complete && value.size() != 3)) throw new Invalid("scenarioPreference");
        Map<Major,Integer> ranks = new EnumMap<>(Major.class);
        for (JsonNode item : value) {
            if (!item.isObject() || item.size() != 2 || !item.has("majorCode") || !item.has("rank")) throw new Invalid("scenarioPreference");
            Major major = enumeration(item.get("majorCode"), Major.class, "scenarioPreference");
            JsonNode rank = item.get("rank");
            if (!rank.isIntegralNumber() || !rank.canConvertToInt() || rank.intValue() < 1 || rank.intValue() > 3 || ranks.put(major, rank.intValue()) != null) throw new Invalid("scenarioPreference");
        }
        List<Integer> levels = ranks.values().stream().distinct().sorted().toList();
        for (int i = 0; complete && i < levels.size(); i++) if (levels.get(i) != i + 1) throw new Invalid("scenarioPreference");
        return ranks.entrySet().stream().map(e -> new ScenarioRank(e.getKey(), e.getValue())).toList();
    }
}
