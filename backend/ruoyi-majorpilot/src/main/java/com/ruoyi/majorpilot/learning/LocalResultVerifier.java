package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.JsonNode;
import com.ruoyi.majorpilot.shared.ApiException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.*;

/** Pure calculation boundary. It never reads a local workbook or evaluates a Student's reasoning. */
public final class LocalResultVerifier {
    public static final String VERSION = "local-result-check-v1";
    public enum Status { MATCHED, MISMATCHED, NOT_REPRODUCIBLE, VERSION_MISMATCH, NOT_CHECKED }
    public enum Unit { COUNT, PERCENT, PERCENTAGE_POINTS, CONTACTS_PER_100_ENROLLED }
    public record Basis(String taskVersionId, String workbookVersion, String workbookSha256, String sourceSha256) {
        public Basis {
            if (taskVersionId == null || !taskVersionId.matches("[0-7][0-9A-HJKMNP-TV-Z]{25}")
                || workbookVersion == null || !workbookVersion.matches("[0-9]+\\.[0-9]+\\.[0-9]+")
                || workbookSha256 == null || !workbookSha256.matches("[a-f0-9]{64}")
                || sourceSha256 == null || !sourceSha256.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid trusted basis");
        }
    }
    /** Decimal input remains a string: 32 and 32.4 have different declared rounding precision. */
    public record Submission(String workbookVersion, String workbookSha256, String method, JsonNode specification,
                             Map<String, String> values, String reason) {
        public Submission {
            if (specification == null || values == null) throw invalid();
            specification = specification.deepCopy();
            values = Collections.unmodifiableMap(new LinkedHashMap<>(values));
        }
        @Override public JsonNode specification() { return specification.deepCopy(); }
    }
    /** A missing denominator is represented by null, never fabricated as a zero percentage. */
    public record Metric(BigInteger numerator, BigInteger denominator, Unit unit) {
        public Metric {
            Objects.requireNonNull(numerator); Objects.requireNonNull(denominator); Objects.requireNonNull(unit);
            if (denominator.signum() < 0) throw new IllegalArgumentException("Negative denominator");
        }
        public BigDecimal rounded(int scale) {
            return denominator.signum() == 0 ? null : new BigDecimal(numerator).divide(new BigDecimal(denominator), scale, RoundingMode.HALF_UP);
        }
    }
    public record FieldCheck(String field, String originalValue, Unit unit, BigDecimal expectedAtEnteredPrecision,
                             boolean matched, String code) {}
    public record Result(String ruleVersion, Status status, Basis basis, Submission original,
                         Map<String, Metric> recalculated, List<FieldCheck> checks, List<String> limitations) {
        public Result { recalculated = Collections.unmodifiableMap(new LinkedHashMap<>(recalculated)); checks = List.copyOf(checks); limitations = List.copyOf(limitations); }
    }
    private static final Set<String> COURSES = Set.of("FOUNDATIONS", "APPLIED");
    private static final Set<String> SOURCES = Set.of("ORGANIC", "PARTNER", "CAMPAIGN");
    private static final List<String> FUNNEL = List.of("enrolled_count", "first_lesson_count", "week_one_active_count", "assignment_started_count", "assignment_submitted_count", "completed_count");
    private static final List<String> LIMITATIONS = List.of("核对只说明数值与所选规则一致，不证明本地 Excel 操作过程或独立完成。", "解释与专业理解需要结合具体回答另行分析，不能由数值状态推断。");
    private LocalResultVerifier() {}

    public static Result verify(String major, Basis basis, Submission input, JsonNode publicRows) {
        validateEnvelope(input);
        if (!basis.workbookVersion().equals(input.workbookVersion()) || !basis.workbookSha256().equals(input.workbookSha256()))
            return result(Status.VERSION_MISMATCH, basis, input, Map.of(), List.of());
        if (input.method().equals("OTHER")) return result(Status.NOT_REPRODUCIBLE, basis, input, Map.of(), List.of());
        Map<String, Metric> expected = calculate(major, input.specification(), publicRows);
        if (!input.values().keySet().equals(expected.keySet())) throw invalid();
        var checks = new ArrayList<FieldCheck>();
        for (var entry : expected.entrySet()) {
            String original = input.values().get(entry.getKey());
            Metric metric = entry.getValue();
            if (original.equals("UNDEFINED")) {
                checks.add(new FieldCheck(entry.getKey(), original, metric.unit(), metric.rounded(2), metric.denominator().signum() == 0, metric.denominator().signum() == 0 ? "MATCHED_UNDEFINED" : "VALUE_REQUIRED"));
                continue;
            }
            var decimal = new BigDecimal(original);
            if (metric.unit() == Unit.COUNT && !original.matches("-?(0|[1-9][0-9]{0,8})")) throw invalid();
            BigDecimal calculated = metric.rounded(decimal.scale());
            boolean matched = calculated != null && decimal.compareTo(calculated) == 0;
            checks.add(new FieldCheck(entry.getKey(), original, metric.unit(), calculated, matched, matched ? "MATCHED" : calculated == null ? "DENOMINATOR_ZERO" : "VALUE_DIFFERS"));
        }
        return result(checks.stream().allMatch(FieldCheck::matched) ? Status.MATCHED : Status.MISMATCHED, basis, input, expected, checks);
    }
    /** The caller must first persist the original input; a failed calculation must not masquerade as a mismatch. */
    public static Result unavailable(Basis basis, Submission input) {
        validateEnvelope(input);
        return result(Status.NOT_CHECKED, basis, input, Map.of(), List.of());
    }
    private static Result result(Status status, Basis basis, Submission input, Map<String, Metric> values, List<FieldCheck> checks) {
        return new Result(VERSION, status, basis, input, values, checks, LIMITATIONS);
    }
    private static void validateEnvelope(Submission input) {
        if (input == null || input.workbookVersion() == null || !input.workbookVersion().matches("[0-9]+\\.[0-9]+\\.[0-9]+")
            || input.workbookSha256() == null || !input.workbookSha256().matches("[a-f0-9]{64}")
            || !Set.of("SUPPORTED", "OTHER").contains(input.method() == null ? "" : input.method())
            || input.reason() == null || input.reason().isBlank() || input.reason().codePointCount(0, input.reason().length()) > 2000
            || !input.specification().isObject() || input.specification().toString().length() > 12000 || input.values().size() > 40) throw invalid();
        for (var entry : input.values().entrySet()) {
            if (entry.getKey() == null || !entry.getKey().matches("[A-Za-z][A-Za-z0-9.]{0,79}") || entry.getValue() == null
                || !(entry.getValue().equals("UNDEFINED") || entry.getValue().matches("-?(0|[1-9][0-9]{0,8})(\\.[0-9]{1,6})?"))) throw invalid();
        }
    }
    /** For an explicitly requested web calculation, the same pure function supplies the disclosed baseline. */
    public static Map<String, Metric> calculate(String major, JsonNode specification, JsonNode publicRows) {
        if (major == null) throw invalid();
        if (publicRows == null || !publicRows.isArray() || publicRows.size() > 5000) throw sourceInvalid();
        return Collections.unmodifiableMap(switch (major) {
            case "DATA_SCIENCE" -> ds(specification, publicRows);
            case "BUSINESS_ANALYTICS" -> ba(specification, publicRows);
            default -> throw invalid();
        });
    }
    private static Map<String, Metric> ds(JsonNode spec, JsonNode rows) {
        fields(spec, "duplicatePolicy", "excludedRowIds", "earlyThroughDay", "latestDay", "missingDaysPolicy", "resultSet");
        if (!Set.of("KEEP_ALL", "REMOVE_EXACT").contains(spec.path("duplicatePolicy").asText())
            || !spec.path("missingDaysPolicy").asText().equals("EXCLUDE_FROM_COMPARISON")) throw invalid();
        int early = integer(spec, "earlyThroughDay", 0, 27), latest = integer(spec, "latestDay", early + 1, 28);
        String resultSet = spec.path("resultSet").asText();
        if (!Set.of("CLEANING", "COMPARISON", "COURSE_CHECK", "FULL").contains(resultSet)) throw invalid();
        JsonNode excluded = spec.path("excludedRowIds");
        if (!excluded.isArray() || excluded.size() > rows.size()) throw invalid();
        Set<String> excludedIds = new HashSet<>();
        for (var id : excluded) {
            if (!id.isTextual() || !id.asText().matches("raw-[0-9]{3,4}") || !excludedIds.add(id.asText())) throw invalid();
            int position = Integer.parseInt(id.asText().substring(4));
            if (position < 1 || position > rows.size() || !id.asText().equals(String.format(Locale.ROOT, "raw-%03d", position))) throw invalid();
        }
        List<JsonNode> retained = new ArrayList<>(); Set<JsonNode> exact = new HashSet<>(); int duplicateCount = 0;
        for (int index = 0; index < rows.size(); index++) {
            JsonNode row = rows.get(index); requireDsRow(row);
            // Exclusions name original row IDs, before deduplication; order is part of this rule version.
            if (excludedIds.contains(String.format(Locale.ROOT, "raw-%03d", index + 1))) continue;
            if (!exact.add(row) && spec.path("duplicatePolicy").asText().equals("REMOVE_EXACT")) { duplicateCount++; continue; }
            retained.add(row);
        }
        Map<String, Metric> output = new LinkedHashMap<>();
        count(output, "retainedRows", retained.size()); count(output, "uniqueLearners", retained.stream().map(r -> r.path("learner_id").asText()).distinct().count());
        count(output, "excludedRows", excludedIds.size()); count(output, "duplicateRowsRemoved", duplicateCount);
        count(output, "notStartedRows", retained.stream().filter(r -> r.path("lessons_started").asInt() == 0).count());
        count(output, "missingStartedDaysRows", retained.stream().filter(r -> r.path("lessons_started").asInt() > 0 && r.path("days_to_first_lesson").isNull()).count());
        count(output, "outsideDayRangeRows", retained.stream().filter(r -> r.path("lessons_started").asInt() > 0 && r.path("days_to_first_lesson").isNumber() && (r.path("days_to_first_lesson").asInt() < 0 || r.path("days_to_first_lesson").asInt() > latest)).count());
        dsGroups(output, "all", retained, early, latest);
        for (String course : List.of("FOUNDATIONS", "APPLIED")) dsGroups(output, course, retained.stream().filter(r -> r.path("course_track").asText().equals(course)).toList(), early, latest);
        // Each checkpoint requests only its relevant results, not 25 compulsory fields at once.
        output.keySet().removeIf(key -> switch (resultSet) {
            case "CLEANING" -> !Set.of("retainedRows", "uniqueLearners", "duplicateRowsRemoved").contains(key);
            case "COMPARISON" -> !key.startsWith("all.");
            case "COURSE_CHECK" -> !(key.startsWith("FOUNDATIONS.") || key.startsWith("APPLIED."));
            default -> false;
        });
        return output;
    }
    private static void dsGroups(Map<String, Metric> output, String prefix, List<JsonNode> rows, int early, int latest) {
        for (String group : List.of("early", "later")) {
            List<JsonNode> selected = rows.stream().filter(r -> r.path("lessons_started").asInt() > 0 && r.path("days_to_first_lesson").isIntegralNumber())
                .filter(r -> { int day = r.path("days_to_first_lesson").asInt(); return group.equals("early") ? day >= 0 && day <= early : day > early && day <= latest; }).toList();
            long completed = selected.stream().filter(r -> r.path("completed").asBoolean()).count();
            count(output, prefix + "." + group + "Count", selected.size()); count(output, prefix + "." + group + "Completed", completed);
            output.put(prefix + "." + group + "Percent", ratio(completed * 100, selected.size(), Unit.PERCENT));
        }
    }
    private static Map<String, Metric> ba(JsonNode spec, JsonNode rows) {
        fields(spec, "baselineStartWeek", "baselineEndWeek", "comparisonStartWeek", "comparisonEndWeek", "courseTrack", "signupSource", "numerator", "denominator");
        int b1 = integer(spec, "baselineStartWeek", 1, 12), b2 = integer(spec, "baselineEndWeek", b1, 12);
        int c1 = integer(spec, "comparisonStartWeek", 1, 12), c2 = integer(spec, "comparisonEndWeek", c1, 12);
        if (!(b2 < c1 || c2 < b1)) throw invalid();
        String course = spec.path("courseTrack").asText(), source = spec.path("signupSource").asText();
        if (!(course.equals("ALL") || COURSES.contains(course)) || !(source.equals("ALL") || SOURCES.contains(source))) throw invalid();
        String numerator = spec.path("numerator").asText(), denominator = spec.path("denominator").asText();
        boolean overall = numerator.equals("completed_count") && Set.of("enrolled_count", "first_lesson_count").contains(denominator);
        boolean adjacent = FUNNEL.contains(numerator) && FUNNEL.indexOf(numerator) == FUNNEL.indexOf(denominator) + 1 && FUNNEL.contains(denominator);
        if (!overall && !adjacent) throw invalid();
        var periods = List.of(new int[]{b1,b2}, new int[]{c1,c2}); long[][] counts = new long[2][4];
        Set<String> sourceKeys = new HashSet<>();
        for (JsonNode row : rows) {
            requireBaRow(row);
            if (!sourceKeys.add(row.path("week").asInt() + ":" + row.path("course_track").asText() + ":" + row.path("signup_source").asText())) throw sourceInvalid();
            if (!course.equals("ALL") && !row.path("course_track").asText().equals(course) || !source.equals("ALL") && !row.path("signup_source").asText().equals(source)) continue;
            for (int period = 0; period < 2; period++) {
                int week = row.path("week").asInt(); if (week < periods.get(period)[0] || week > periods.get(period)[1]) continue;
                counts[period][0] += row.path(numerator).asLong(); counts[period][1] += row.path(denominator).asLong();
                counts[period][2] += row.path("support_contact_count").asLong(); counts[period][3] += row.path("enrolled_count").asLong();
            }
        }
        Map<String, Metric> output = new LinkedHashMap<>();
        for (int period = 0; period < 2; period++) {
            String name = period == 0 ? "baseline" : "comparison";
            count(output, name + "Numerator", counts[period][0]); count(output, name + "Denominator", counts[period][1]);
            count(output, name + "NotContinuing", counts[period][1] - counts[period][0]);
            output.put(name + "Percent", ratio(counts[period][0] * 100, counts[period][1], Unit.PERCENT));
            output.put(name + "SupportContactsPer100Enrollments", ratio(counts[period][2] * 100, counts[period][3], Unit.CONTACTS_PER_100_ENROLLED));
        }
        BigInteger difference = BigInteger.valueOf(counts[1][0]).multiply(BigInteger.valueOf(counts[0][1])).subtract(BigInteger.valueOf(counts[0][0]).multiply(BigInteger.valueOf(counts[1][1]))).multiply(BigInteger.valueOf(100));
        output.put("changePercentagePoints", new Metric(difference, BigInteger.valueOf(counts[0][1]).multiply(BigInteger.valueOf(counts[1][1])), Unit.PERCENTAGE_POINTS));
        // Undefined when either period lacks a denominator or the baseline proportion is zero.
        BigInteger relativeDenominator = counts[0][1] == 0 ? BigInteger.ZERO : BigInteger.valueOf(counts[0][0]).multiply(BigInteger.valueOf(counts[1][1]));
        output.put("relativeChangePercent", new Metric(difference, relativeDenominator, Unit.PERCENT));
        return output;
    }
    private static void requireDsRow(JsonNode row) {
        if (!row.isObject() || !row.path("learner_id").isTextual() || row.path("learner_id").asText().isBlank()
            || !COURSES.contains(row.path("course_track").asText()) || !row.path("completed").isBoolean()
            || !sourceInteger(row.path("lessons_started"), 0, 10000)
            || !(row.path("days_to_first_lesson").isNull() || sourceInteger(row.path("days_to_first_lesson"), -10000, 10000))) throw sourceInvalid();
    }
    private static void requireBaRow(JsonNode row) {
        if (!row.isObject() || !sourceInteger(row.path("week"), 1, 12) || !COURSES.contains(row.path("course_track").asText()) || !SOURCES.contains(row.path("signup_source").asText())) throw sourceInvalid();
        long previous = Long.MAX_VALUE;
        for (String field : FUNNEL) { if (!sourceInteger(row.path(field), 0, 10000000) || row.path(field).asLong() > previous) throw sourceInvalid(); previous = row.path(field).asLong(); }
        if (!sourceInteger(row.path("support_contact_count"), 0, 10000000)) throw sourceInvalid();
    }
    private static boolean sourceInteger(JsonNode node, long min, long max) { return node.isIntegralNumber() && node.canConvertToLong() && node.longValue() >= min && node.longValue() <= max; }
    private static int integer(JsonNode object, String field, int min, int max) { if (!sourceInteger(object.path(field), min, max)) throw invalid(); return object.path(field).asInt(); }
    private static void fields(JsonNode node, String... names) {
        if (node == null || !node.isObject()) throw invalid();
        Set<String> actual = new HashSet<>(); node.fieldNames().forEachRemaining(actual::add);
        if (!actual.equals(Set.of(names))) throw invalid();
    }
    private static void count(Map<String, Metric> output, String key, long count) { output.put(key, ratio(count, 1, Unit.COUNT)); }
    private static Metric ratio(long numerator, long denominator, Unit unit) { return new Metric(BigInteger.valueOf(numerator), BigInteger.valueOf(denominator), unit); }
    private static ApiException invalid() { return new ApiException(422, "LOCAL_RESULT_FORMAT_INVALID"); }
    private static ApiException sourceInvalid() { return new ApiException(503, "LOCAL_RESULT_SOURCE_INVALID"); }
}
