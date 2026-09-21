package com.ruoyi.majorpilot.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.shared.ApiException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class OperationsTest {
    @Test void pagingSortingAndFilterTimeAreClosedAndBounded(){
        var q=OperationsQuery.parse(Map.of());assertEquals(1,q.pageNum());assertEquals(20,q.pageSize());assertEquals("a.id desc",q.order(Map.of("id","a.id"),"id"));
        for(var query:List.of(Map.of("pageNum","0"),Map.of("pageSize","101"),Map.of("pageSize","1.5"),Map.of("sortOrder","desc;drop table x"),Map.of("status","x' OR 1=1"),Map.of("from","broken"),Map.of("majorCode","DS"),Map.of("unknown","x")))assertEquals(422,assertThrows(ApiException.class,()->OperationsQuery.parse(query)).status);
        assertThrows(ApiException.class,()->OperationsQuery.parse(Map.of("sortBy","password_hash")).order(Map.of("id","a.id"),"id"));
    }
    @Test void exportTimeDefaultsFreezeOnceAndRejectFutureAndExcessRange(){
        Instant now=Instant.parse("2026-09-21T06:00:00Z");var f=OperationsQuery.filters(null,now);assertEquals(now,f.asOf());assertEquals(now.minusSeconds(90*86400),f.from());
        assertThrows(ApiException.class,()->OperationsQuery.filters(new OperationsDtos.Filters(now,now,now,null,null,null,null),now));
        assertThrows(ApiException.class,()->OperationsQuery.filters(new OperationsDtos.Filters(now.minusSeconds(367*86400),now,now,null,null,null,null),now));
        assertThrows(ApiException.class,()->OperationsQuery.filters(new OperationsDtos.Filters(null,null,now.plusMillis(1),null,null,null,null),now));
    }
    @Test void csvFieldsCannotSelectPrivateDataOrDuplicateColumns(){
        for(String privateField:List.of("email","password_hash","reflection","reportBody","comment","purpose","studentId"))assertThrows(ApiException.class,()->OperationsCsv.fields("STUDENTS",List.of(privateField)));
        assertThrows(ApiException.class,()->OperationsCsv.fields("STUDENTS",List.of("alias","alias")));
        assertThrows(ApiException.class,()->OperationsCsv.fields("RAW_EVENTS",null));
        assertEquals(List.of("alias"),OperationsCsv.fields("STUDENTS",List.of("alias")));
    }
    @Test void csvEscapesDelimitersAndFormulasWithoutReplacingUnknownRatesWithZero(){
        var row=new LinkedHashMap<String,Object>();row.put("alias"," =HYPERLINK(\"x\",\"y\")");row.put("text","a,b\n\"c\"");row.put("unknown",null);row.put("number",new BigDecimal("-0.250000"));
        String text=new String(OperationsCsv.render(List.of("alias","text","unknown","number"),List.of(row)),StandardCharsets.UTF_8);
        assertTrue(text.startsWith("\uFEFF\"alias\""));assertTrue(text.contains("\"' =HYPERLINK(\"\"x\"\",\"\"y\"\")\""));assertTrue(text.contains("\"a,b\n\"\"c\"\"\""));assertTrue(text.contains("\"\",\"-0.250000\""));
        for(String formula:List.of("=1+1","+cmd","-cmd","@SUM(1)","\t=1","\r=1","\n=1"))assertTrue(OperationsCsv.cell(formula).startsWith("\"'"));
    }
    @Test void rowCapFailsInsteadOfReturningTruncatedSuccess(){var tooMany=Collections.nCopies(10001,Map.<String,Object>of("alias","synthetic"));assertEquals("EXPORT_ROW_LIMIT_EXCEEDED",assertThrows(ApiException.class,()->OperationsCsv.render(List.of("alias"),tooMany)).code);}
    @Test void purposesAndDiagnosticsContainNoRawUnknownText(){
        OperationsAudit.purpose("SUPPORT_REQUEST","Student requested specific support");
        assertThrows(ApiException.class,()->OperationsAudit.purpose("anything","Student requested specific support"));assertThrows(ApiException.class,()->OperationsAudit.purpose("QUALITY_REVIEW","x"));
        assertEquals("TIMEOUT",OperationsHealth.code("TIMEOUT"));assertEquals("UNCLASSIFIED_ERROR",OperationsHealth.code("vendor response with email@example.invalid"));
    }
    @Test void defaultProjectionTypesDoNotHaveEmailAnswersOrBodyFields(){
        for(Class<?> type:List.of(OperationsDtos.StudentRow.class,OperationsDtos.RunRow.class,OperationsDtos.ReportRow.class,OperationsDtos.TaskRow.class,OperationsDtos.AuditRow.class)){Set<String> fields=new HashSet<>();for(var field:type.getRecordComponents())fields.add(field.getName());assertTrue(Collections.disjoint(fields,Set.of("email","password","response","reflection","structuredReportJson","reason","reasonText","beforeSummary","afterSummary")));}
    }
    @Test void malformedInsightIsNotSilentlyConvertedToAnUnansweredSurvey() throws Exception {
        var mapper=new ObjectMapper();assertNull(OperationsMetrics.insight(mapper.nullNode()));assertNull(OperationsMetrics.insight(mapper.missingNode()));assertEquals(5,OperationsMetrics.insight(mapper.readTree("5")));
        for(String raw:List.of("1.5","\"3\"","2147483649","0","6","false","{}")){var node=mapper.readTree(raw);var failure=assertThrows(ApiException.class,()->OperationsMetrics.insight(node));assertEquals(503,failure.status);assertEquals("METRICS_SOURCE_INVALID",failure.code);}
    }
    @Test void comparisonFiltersNeverSelectAnArbitraryRunAsTheReportAnchor(){
        for(var dimensions:List.of(Map.of("majorCode","AI"),Map.of("taskVersionId","01JF1000000000000000000001"),Map.of("questionnaireVersion","v1"),Map.of("recommendationRuleVersion","v1"))){var input=new HashMap<>(dimensions);input.put("reportType","COMPARISON");assertEquals("FILTER_CONFLICT",assertThrows(ApiException.class,()->OperationsQuery.parse(input)).code);}
        assertEquals("COMPARISON",OperationsQuery.parse(Map.of("reportType","COMPARISON")).filters().reportType());assertThrows(ApiException.class,()->OperationsQuery.parse(Map.of("reportType","COMPARISON")).withoutReportType());
        assertTrue(OperationsQuery.reportScope(OperationsQuery.parse(Map.of("majorCode","AI")).filters()).get(1).contains("不包含COMPARISON"));
    }
    @Test void reviewContextContainsOnlyServerPathAndActualRequiredKeys()throws Exception{var mapper=new ObjectMapper();var manifest=mapper.readTree("{\"review\":{\"checkKeys\":[\"PROFESSIONAL_CORE\",\"TIMING_45_60\"]},\"assets\":[{\"path\":\"private-evaluation.json\"}]}" );var row=new HashMap<String,Object>(Map.of("public_id","01JA1000000000000000000001","manifest_path","ai-support/1.0.0/manifest.json","status","REVIEW","row_version",3));var result=OperationsService.reviewContext(row,manifest);assertEquals(List.of("PROFESSIONAL_CORE","TIMING_45_60"),result.requiredReviewChecks());assertFalse(mapper.valueToTree(result).has("assets"));for(String bad:List.of("/private/manifest.json","x/../manifest.json","x//manifest.json","file:///secret/manifest.json")){row.put("manifest_path",bad);assertEquals("CONTENT_INTEGRITY_FAILED",assertThrows(ApiException.class,()->OperationsService.reviewContext(row,manifest)).code);}row.put("manifest_path","ai-support/1.0.0/manifest.json");assertThrows(ApiException.class,()->OperationsService.reviewContext(row,mapper.readTree("{\"review\":{\"checkKeys\":[\"X\",\"X\"]}}")));}
}
