package com.ruoyi.majorpilot.learning;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.ruoyi.majorpilot.content.TaskContentRepository;
import com.ruoyi.majorpilot.shared.ApiException;
import java.math.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static com.ruoyi.majorpilot.learning.LocalResultVerifier.*;
import static org.junit.jupiter.api.Assertions.*;

class LocalResultVerifierTest {
    private final ObjectMapper json = new ObjectMapper();
    private final Basis basis = new Basis("01JD1000000000000000000001", "1.0.0", "a".repeat(64), "b".repeat(64));
    private ObjectNode read(String value) { try { return (ObjectNode) json.readTree(value); } catch (Exception e) { throw new IllegalArgumentException(e); } }
    private ObjectNode dsSpec() { return read("""
        {"duplicatePolicy":"REMOVE_EXACT","excludedRowIds":[],"earlyThroughDay":3,"latestDay":28,"missingDaysPolicy":"EXCLUDE_FROM_COMPARISON","resultSet":"FULL"}
        """); }
    private ObjectNode baSpec() { return read("""
        {"baselineStartWeek":1,"baselineEndWeek":6,"comparisonStartWeek":7,"comparisonEndWeek":12,"courseTrack":"ALL","signupSource":"ALL","numerator":"completed_count","denominator":"enrolled_count"}
        """); }
    private JsonNode dataset(String directory, String asset) throws Exception {
        var repo = new TaskContentRepository(json);
        return json.readTree(repo.asset(repo.get(directory + "/1.0.0/manifest.json"), asset, true));
    }
    private Map<String, String> values(Map<String, Metric> calculated, int decimals) {
        var result = new LinkedHashMap<String, String>();
        calculated.forEach((key, metric) -> { var value = metric.rounded(metric.unit() == Unit.COUNT ? 0 : decimals); result.put(key, value == null ? "UNDEFINED" : value.toPlainString()); });
        return result;
    }
    private Submission submission(JsonNode spec, Map<String, String> values) { return new Submission("1.0.0", basis.workbookSha256(), "SUPPORTED", spec, values, "按所选范围计算；解释不由数字核对代替。"); }
    private ArrayNode dsRows(ObjectNode... rows) { return json.valueToTree(rows); }
    private ObjectNode learner(String id, int started, Integer day, boolean completed) {
        var r = json.createObjectNode().put("learner_id", id).put("course_track", "FOUNDATIONS").put("lessons_started", started).put("completed", completed);
        if (day == null) r.putNull("days_to_first_lesson"); else r.put("days_to_first_lesson", day);
        return r;
    }
    private void exact(Map<String, Metric> actual, String key, String expected) { assertEquals(new BigDecimal(expected), actual.get(key).rounded(new BigDecimal(expected).scale()), key); }

    @Test void dsCanonicalFactsAreIndependentlyPinnedIncludingRestrictedPopulationAndCourseGroups() throws Exception {
        var rows = dataset("ds-learning", "learner-activity"); var spec = dsSpec();
        var result = calculate("DATA_SCIENCE", spec, rows);
        for (var pair : Map.of("retainedRows",359,"uniqueLearners",359,"duplicateRowsRemoved",1,"notStartedRows",51,"missingStartedDaysRows",8,"outsideDayRangeRows",0,"excludedRows",0).entrySet()) exact(result,pair.getKey(),pair.getValue().toString());
        for (var pair : Map.of("all.earlyCount",100,"all.earlyCompleted",58,"all.laterCount",200,"all.laterCompleted",93,"FOUNDATIONS.earlyCount",59,"FOUNDATIONS.earlyCompleted",38,"FOUNDATIONS.laterCount",99,"FOUNDATIONS.laterCompleted",56,"APPLIED.earlyCount",41,"APPLIED.earlyCompleted",20).entrySet()) exact(result,pair.getKey(),pair.getValue().toString());
        exact(result,"APPLIED.laterCount","101"); exact(result,"APPLIED.laterCompleted","37");
        exact(result,"all.earlyPercent","58.0"); exact(result,"all.laterPercent","46.5");
        var checked = verify("DATA_SCIENCE",basis,submission(spec,values(result,2)),rows);
        assertEquals(Status.MATCHED,checked.status()); assertEquals(25,checked.checks().size());
        assertTrue(checked.limitations().getFirst().contains("不证明"));
    }
    @Test void exactDuplicatesAreNotConflatedWithSamePersonDifferentRowsAndExclusionsUseOriginalIds() {
        var first=learner("p1",1,0,true); var changed=learner("p1",1,3,false);
        var rows=dsRows(first,first.deepCopy(),changed); var spec=dsSpec();
        exact(calculate("DATA_SCIENCE",spec,rows),"retainedRows","2");
        exact(calculate("DATA_SCIENCE",spec,rows),"uniqueLearners","1");
        spec.withArray("excludedRowIds").add("raw-001");
        var excluded=calculate("DATA_SCIENCE",spec,rows); exact(excluded,"retainedRows","2");exact(excluded,"duplicateRowsRemoved","0");
        spec.withArray("excludedRowIds").add("raw-001"); assertThrows(ApiException.class,()->calculate("DATA_SCIENCE",spec,rows));
        spec.set("excludedRowIds",json.createArrayNode().add("raw-004")); assertThrows(ApiException.class,()->calculate("DATA_SCIENCE",spec,rows));
    }
    @Test void nullZeroNotStartedAndBoundaryDaysRemainDistinct() {
        var rows=dsRows(learner("n",0,null,false),learner("missing",1,null,false),learner("zero",1,0,true),learner("three",1,3,false),learner("four",1,4,true),learner("last",1,28,false),learner("outside",1,29,true));
        var actual=calculate("DATA_SCIENCE",dsSpec(),rows);
        exact(actual,"notStartedRows","1");exact(actual,"missingStartedDaysRows","1");exact(actual,"outsideDayRangeRows","1");
        exact(actual,"all.earlyCount","2");exact(actual,"all.laterCount","2");exact(actual,"all.earlyPercent","50");
        assertNull(actual.get("APPLIED.earlyPercent").rounded(2));
        var blankRows=dsRows(learner("x",1,null,false),learner("y",0,null,false));
        var empty=calculate("DATA_SCIENCE",dsSpec(),blankRows);assertNull(empty.get("all.earlyPercent").rounded(2));
        assertEquals(Status.MATCHED,verify("DATA_SCIENCE",basis,submission(dsSpec(),values(empty,2)),blankRows).status());
    }
    @Test void canonicalBaSumsCountsBeforeRatiosAndKeepsContactsAsEvents() throws Exception {
        var rows=dataset("ba-learning","weekly-funnel");var spec=baSpec();var result=calculate("BUSINESS_ANALYTICS",spec,rows);
        exact(result,"baselineNumerator","100");exact(result,"baselineDenominator","180");
        exact(result,"comparisonNumerator","58");exact(result,"comparisonDenominator","179");
        exact(result,"baselinePercent","55.56");exact(result,"comparisonPercent","32.40");
        exact(result,"changePercentagePoints","-23.15");exact(result,"relativeChangePercent","-41.68");
        exact(result,"baselineSupportContactsPer100Enrollments","157.22");
        assertEquals(Unit.CONTACTS_PER_100_ENROLLED,result.get("baselineSupportContactsPer100Enrollments").unit());
        assertEquals(Status.MATCHED,verify("BUSINESS_ANALYTICS",basis,submission(spec,values(result,1)),rows).status());
        spec.put("denominator","first_lesson_count");var started=calculate("BUSINESS_ANALYTICS",spec,rows);
        exact(started,"baselineDenominator","166");exact(started,"comparisonDenominator","142");
        exact(started,"baselinePercent","60.24");exact(started,"comparisonPercent","40.85");
    }
    @Test void everyAdjacentBaPairAndLegalSubgroupIsCalculableWithoutChoosingStudentsPriority() throws Exception {
        var rows=dataset("ba-learning","weekly-funnel");
        var steps=List.of("enrolled_count","first_lesson_count","week_one_active_count","assignment_started_count","assignment_submitted_count","completed_count");
        for(int i=1;i<steps.size();i++) for(String course:List.of("ALL","FOUNDATIONS","APPLIED")) for(String source:List.of("ALL","ORGANIC","PARTNER","CAMPAIGN")) {
            var spec=baSpec().put("denominator",steps.get(i-1)).put("numerator",steps.get(i)).put("courseTrack",course).put("signupSource",source);
            var expected=calculate("BUSINESS_ANALYTICS",spec,rows);
            assertEquals(Status.MATCHED,verify("BUSINESS_ANALYTICS",basis,submission(spec,values(expected,2)),rows).status());
        }
    }
    @Test void percentageInputUsesDeclaredPrecisionAndCountsAreExact() throws Exception {
        var rows=dataset("ba-learning","weekly-funnel");var spec=baSpec();var expected=calculate("BUSINESS_ANALYTICS",spec,rows);
        var input=values(expected,2);input.put("comparisonPercent","32.4");
        assertEquals(Status.MATCHED,verify("BUSINESS_ANALYTICS",basis,submission(spec,input),rows).status());
        input.put("comparisonPercent","32.39");input.put("comparisonNumerator","59");
        var checked=verify("BUSINESS_ANALYTICS",basis,submission(spec,input),rows);
        assertEquals(Status.MISMATCHED,checked.status());assertEquals("59",checked.original().values().get("comparisonNumerator"));
        assertEquals(2,checked.checks().stream().filter(c->!c.matched()).count());
        input.put("comparisonNumerator","58.0");assertThrows(ApiException.class,()->verify("BUSINESS_ANALYTICS",basis,submission(spec,input),rows));
        assertEquals(new BigDecimal("32.5"),new Metric(BigInteger.valueOf(3245),BigInteger.valueOf(100),Unit.PERCENT).rounded(1));
        assertEquals(new BigDecimal("-32.5"),new Metric(BigInteger.valueOf(-3245),BigInteger.valueOf(100),Unit.PERCENTAGE_POINTS).rounded(1));
    }
    @Test void versionMismatchAndUnsupportedMethodsDoNotCalculateOrJudgeTheReason() {
        var original=new Submission("0.9.0",basis.workbookSha256(),"SUPPORTED",dsSpec(),Map.of(),"我还不确定");
        assertEquals(Status.VERSION_MISMATCH,verify("DATA_SCIENCE",basis,original,null).status());
        original=new Submission("1.0.0","c".repeat(64),"OTHER",json.createObjectNode(),Map.of(),"我在本地采用另一种办法");
        assertEquals(Status.VERSION_MISMATCH,verify("DATA_SCIENCE",basis,original,null).status());
        original=new Submission("1.0.0",basis.workbookSha256(),"OTHER",json.createObjectNode().put("description","自行重组"),Map.of(),"另一种处理方法，不代表错误");
        var checked=verify("DATA_SCIENCE",basis,original,null);
        assertEquals(Status.NOT_REPRODUCIBLE,checked.status());assertTrue(checked.recalculated().isEmpty());assertEquals(original,checked.original());
        assertEquals(Status.NOT_CHECKED,unavailable(basis,original).status());
    }
    @Test void impossibleScopeAndTamperedSourcesAreDifferentErrors() throws Exception {
        var rows=dataset("ba-learning","weekly-funnel");var spec=baSpec().put("comparisonStartWeek",6);
        assertEquals(422,assertThrows(ApiException.class,()->calculate("BUSINESS_ANALYTICS",spec,rows)).status);
        spec.put("comparisonStartWeek",7).put("numerator","support_contact_count");assertThrows(ApiException.class,()->calculate("BUSINESS_ANALYTICS",spec,rows));
        spec.put("numerator","completed_count").put("courseTrack","private-path");assertThrows(ApiException.class,()->calculate("BUSINESS_ANALYTICS",spec,rows));
        var bad=rows.deepCopy();((ObjectNode)bad.get(0)).put("completed_count",999);
        assertEquals(503,assertThrows(ApiException.class,()->calculate("BUSINESS_ANALYTICS",baSpec(),bad)).status);
        var duplicate=(ArrayNode) rows.deepCopy();duplicate.add(rows.get(0).deepCopy());
        assertEquals(503,assertThrows(ApiException.class,()->calculate("BUSINESS_ANALYTICS",baSpec(),duplicate)).status);
    }
    @Test void noMatchingPopulationAndZeroBaselineHaveExplicitUndefinedValues() throws Exception {
        var rows=dataset("ba-learning","weekly-funnel");
        var spec=baSpec().put("baselineEndWeek",1).put("comparisonStartWeek",2).put("comparisonEndWeek",2).put("courseTrack","APPLIED").put("signupSource","PARTNER");
        var result=calculate("BUSINESS_ANALYTICS",spec,rows);exact(result,"baselineDenominator","0");
        assertNull(result.get("baselinePercent").rounded(2));assertNull(result.get("changePercentagePoints").rounded(2));assertNull(result.get("relativeChangePercent").rounded(2));
        var input=values(result,2);input.put("baselinePercent","0");
        var checked=verify("BUSINESS_ANALYTICS",basis,submission(spec,input),rows);
        assertEquals(Status.MISMATCHED,checked.status());assertTrue(checked.checks().stream().anyMatch(c->c.code().equals("DENOMINATOR_ZERO")));
    }
    @Test void envelopeRejectsUnknownFieldsMissingResultsFakePrecisionAndArithmeticExpressions() throws Exception {
        var rows=dataset("ds-learning","learner-activity");var spec=dsSpec();var valid=values(calculate("DATA_SCIENCE",spec,rows),2);
        for(String input:List.of("NaN","Infinity","=1+1","32.4%","001","1e2","1.0000001","","0;SELECT","/Users/private")) {
            var changed=new LinkedHashMap<>(valid);changed.put("all.earlyPercent",input);
            assertEquals(422,assertThrows(ApiException.class,()->verify("DATA_SCIENCE",basis,submission(spec,changed),rows)).status);
        }
        var missing=new LinkedHashMap<>(valid);missing.remove("all.earlyCount");assertThrows(ApiException.class,()->verify("DATA_SCIENCE",basis,submission(spec,missing),rows));
        var extra=dsSpec().put("changeCompleted",true);assertThrows(ApiException.class,()->calculate("DATA_SCIENCE",extra,rows));
    }
    @Test void snapshotsCannotBeChangedThroughCallerOwnedCollections() {
        var spec=dsSpec();var values=new LinkedHashMap<String,String>();values.put("a","1");var input=submission(spec,values);
        spec.put("latestDay",1);values.put("a","2");((ObjectNode)input.specification()).put("latestDay",2);
        assertEquals(28,input.specification().path("latestDay").asInt());assertEquals("1",input.values().get("a"));
        assertThrows(UnsupportedOperationException.class,()->input.values().put("a","3"));
    }
    @Test void checkpointsRequestOnlyRelevantNumbersAndOtherLegitimateProcessingChoicesAreNotMarkedWrong() throws Exception {
        var rows=dataset("ds-learning","learner-activity");
        for(var entry:Map.of("CLEANING",3,"COMPARISON",6,"COURSE_CHECK",12).entrySet()) {
            var spec=dsSpec().put("resultSet",entry.getKey()).put("duplicatePolicy","KEEP_ALL");
            var expected=calculate("DATA_SCIENCE",spec,rows);assertEquals(entry.getValue(),expected.size());
            assertEquals(Status.MATCHED,verify("DATA_SCIENCE",basis,submission(spec,values(expected,2)),rows).status());
        }
        var unsupported=dsSpec().put("missingDaysPolicy","FILL_ALL_ZERO");
        assertThrows(ApiException.class,()->calculate("DATA_SCIENCE",unsupported,rows));
        var other=new Submission("1.0.0",basis.workbookSha256(),"OTHER",unsupported,Map.of(),"这是我另外选择的处理方式");
        assertEquals(Status.NOT_REPRODUCIBLE,verify("DATA_SCIENCE",basis,other,rows).status());
    }
}
