package com.ruoyi.majorpilot.operations;

import com.ruoyi.majorpilot.shared.ApiException;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class OperationsCsv {
    private OperationsCsv(){}
    public static final Map<String,List<String>> FIELDS=Map.of(
        "STUDENTS",List.of("alias","status","createdAt","emailVerifiedAt","startedMajorCount","closedMajorCount"),
        "EXPERIENCE_RUNS",List.of("studentAlias","experienceRunId","majorCode","taskVersionId","status","startedAt","closedAt","attemptNo"),
        "REPORTS",List.of("studentAlias","reportId","reportType","majorCode","status","firstReadyAt","readyAt","generationMode","versionNo"),
        "METRICS",List.of("metric","majorCode","numerator","denominator","rate","cohortCount","immatureCount","anchor","windowDays"));
    public static List<String> fields(String dataset,List<String> selected){var allowed=FIELDS.get(dataset);if(allowed==null)throw OperationsQuery.invalid();if(selected==null)return allowed;if(selected.isEmpty()||selected.size()>allowed.size()||new HashSet<>(selected).size()!=selected.size()||!allowed.containsAll(selected))throw OperationsQuery.invalid();return List.copyOf(selected);}
    public static String anchor(String dataset){return switch(dataset){case "STUDENTS"->"STUDENT_CREATED_AT";case "EXPERIENCE_RUNS"->"RUN_STARTED_AT";case "REPORTS"->"REPORT_FIRST_READY_AT";case "METRICS"->"METRIC_SPECIFIC_ANCHORS";default->throw OperationsQuery.invalid();};}
    public static byte[] render(List<String> fields,List<Map<String,Object>> rows){if(rows.size()>10000)throw new ApiException(422,"EXPORT_ROW_LIMIT_EXCEEDED");var text=new StringBuilder("\uFEFF");text.append(String.join(",",fields.stream().map(OperationsCsv::cell).toList())).append("\r\n");for(var row:rows){text.append(String.join(",",fields.stream().map(f->cell(row.get(f))).toList())).append("\r\n");}return text.toString().getBytes(StandardCharsets.UTF_8);}
    static String cell(Object value){String text=value==null?"":value.toString();if(!(value instanceof Number)&&!(value instanceof Boolean)){String stripped=text.stripLeading();if(!stripped.isEmpty()&&"=+-@".indexOf(stripped.charAt(0))>=0||text.startsWith("\t")||text.startsWith("\r")||text.startsWith("\n"))text="'"+text;}return "\""+text.replace("\"","\"\"")+"\"";}
}
