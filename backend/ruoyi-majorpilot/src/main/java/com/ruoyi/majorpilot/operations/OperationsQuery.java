package com.ruoyi.majorpilot.operations;

import com.ruoyi.majorpilot.shared.ApiException;
import java.time.Instant;
import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Parameter values are bound; only static identifiers can enter ORDER BY. */
public record OperationsQuery(int pageNum,int pageSize,String sortBy,String sortOrder,OperationsDtos.Filters filters,
                              String status,String studentId,String runMode,String exclusionCode) {
    private static final Set<String> MAJORS=Set.of("AI","DATA_SCIENCE","BUSINESS_ANALYTICS");
    public static OperationsDtos.Filters filters(OperationsDtos.Filters input,Instant now) {
        var f=input==null?new OperationsDtos.Filters(null,null,null,null,null,null,null):input;
        Instant asOf=f.asOf()==null?now.truncatedTo(ChronoUnit.MILLIS):f.asOf();
        Instant to=f.to()==null?asOf:f.to(),from=f.from()==null?to.minus(90,ChronoUnit.DAYS):f.from();
        if(asOf.isAfter(now)||asOf.getNano()%1_000_000!=0||from.getNano()%1_000_000!=0||to.getNano()%1_000_000!=0||!from.isBefore(to)||to.isAfter(asOf)||Duration.between(from,to).compareTo(Duration.ofDays(366))>0)throw invalid();
        if(f.majorCode()!=null&&!MAJORS.contains(f.majorCode())||f.taskVersionId()!=null&&!publicId(f.taskVersionId())||!version(f.questionnaireVersion())||!version(f.recommendationRuleVersion()))throw invalid();
        if(f.reportType()!=null&&!Set.of("EXPERIENCE","COMPARISON").contains(f.reportType()))throw invalid();
        if("COMPARISON".equals(f.reportType())&&hasRunDimensions(f))throw new ApiException(422,"FILTER_CONFLICT");
        return new OperationsDtos.Filters(from,to,asOf,f.majorCode(),f.taskVersionId(),f.questionnaireVersion(),f.recommendationRuleVersion(),f.reportType());
    }
    public static OperationsQuery parse(Map<String,String> p) {
        if(!Set.of("pageNum","pageSize","sortBy","sortOrder","from","to","asOf","majorCode","taskVersionId","questionnaireVersion","recommendationRuleVersion","reportType","status","studentId","runMode","exclusionCode").containsAll(p.keySet()))throw invalid();
        try {
            int number=Integer.parseInt(p.getOrDefault("pageNum","1")),size=Integer.parseInt(p.getOrDefault("pageSize","20"));
            String order=p.getOrDefault("sortOrder","desc"),status=p.get("status"),student=p.get("studentId"),mode=p.get("runMode"),exclusion=p.get("exclusionCode");
            if(number<1||number>100000||size<1||size>100||!Set.of("asc","desc").contains(order)||student!=null&&!publicId(student)||status!=null&&!status.matches("[A-Z_]{1,32}")||mode!=null&&!Set.of("STANDARD","REVIEW_PREVIEW").contains(mode)||exclusion!=null&&!Set.of("NONE","TEST","BOT").contains(exclusion))throw invalid();
            return new OperationsQuery(number,size,p.get("sortBy"),order,filters(new OperationsDtos.Filters(time(p,"from"),time(p,"to"),time(p,"asOf"),p.get("majorCode"),p.get("taskVersionId"),p.get("questionnaireVersion"),p.get("recommendationRuleVersion"),p.get("reportType")),Instant.now()),status,student,mode,exclusion);
        } catch(IllegalArgumentException|java.time.DateTimeException bad){throw invalid();}
    }
    public String order(Map<String,String> allowed,String defaultKey){String key=sortBy==null?defaultKey:sortBy;if(!allowed.containsKey(key))throw invalid();return allowed.get(key)+" "+sortOrder;}
    public int offset(){return Math.multiplyExact(pageNum-1,pageSize);}
    public OperationsQuery withoutReportType(){if(filters.reportType()!=null)throw invalid();return this;}
    public static boolean hasRunDimensions(OperationsDtos.Filters f){return f.majorCode()!=null||f.taskVersionId()!=null||f.questionnaireVersion()!=null||f.recommendationRuleVersion()!=null;}
    public static List<String> reportScope(OperationsDtos.Filters f){return List.of("报告时间以首次发布为导出anchor；状态与版本为当前保留记录。",hasRunDimensions(f)?"Run维度只筛选EXPERIENCE原始Run；本次不包含COMPARISON。":"未按Run维度筛选；报告类型依reportType选择，未指定时包含EXPERIENCE与COMPARISON。");}
    public static boolean publicId(String s){return s!=null&&s.matches("[0-7][0-9A-HJKMNP-TV-Z]{25}");}
    private static boolean version(String s){return s==null||s.matches("[A-Za-z0-9._-]{1,80}");}
    private static Instant time(Map<String,String> p,String key){return p.get(key)==null?null:Instant.parse(p.get(key));}
    public static ApiException invalid(){return new ApiException(422,"VALIDATION_ERROR");}
}
