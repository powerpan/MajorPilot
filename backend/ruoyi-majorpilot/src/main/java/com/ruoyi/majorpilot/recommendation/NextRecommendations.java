package com.ruoyi.majorpilot.recommendation;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.intake.DecisionAnswers.Major;
import com.ruoyi.majorpilot.report.core.ReportModels.NextProjection;
import com.ruoyi.majorpilot.shared.*;
import com.ruoyi.majorpilot.acceptance.ProductEligibility;
import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service @Profile("local")
public class NextRecommendations {
    public record Reason(String code,String reasonType,String text) {}
    public record View(String recommendationType,String recommendationId,String sourceRunId,String decisionProfileId,String ruleVersion,String explanationVersion,List<String> completedMajorCodes,String primaryMajor,List<String> alternativeMajors,List<Reason> reasons,List<RecommendationView.MajorDifference> differences,Instant generatedAt) {}
    private final JdbcTemplate db;private final ObjectMapper mapper;private MajorCatalog majors;
    public NextRecommendations(JdbcTemplate db,ObjectMapper mapper){this.db=db;this.mapper=mapper;this.majors=new MajorCatalog(db);}
    @Autowired public void majorCatalog(MajorCatalog majors){this.majors=majors;}
    public boolean isNext(long student,String id){return db.queryForObject("SELECT COUNT(*) FROM mp_recommendation WHERE public_id=? AND student_id=? AND recommendation_type='NEXT'",Integer.class,id,student)==1;}
    private List<String> strings(Object value){try{var a=mapper.readTree(value.toString());var out=new ArrayList<String>();a.forEach(v->out.add(v.asText()));return List.copyOf(out);}catch(Exception bad){throw new ApiException(409,"REPORT_SOURCE_INVALID");}}
    public View owned(long student,String id){var rows=db.queryForList("SELECT n.*,r.public_id AS run_public_id,p.public_id AS profile_public_id FROM mp_recommendation n JOIN mp_experience_run r ON r.id=n.source_run_id JOIN mp_decision_profile p ON p.id=n.decision_profile_id WHERE n.public_id=? AND n.student_id=? AND n.recommendation_type='NEXT' AND "+ProductEligibility.sql("r")+" AND r.status='CLOSED'",id,student);if(rows.isEmpty())throw new ApiException(404,"RECOMMENDATION_NOT_FOUND");var row=rows.getFirst();
        var reasons=db.queryForList("SELECT reason_code,reason_type,display_text FROM mp_recommendation_reason WHERE recommendation_id=? ORDER BY reason_order",row.get("id")).stream().map(r->new Reason((String)r.get("reason_code"),(String)r.get("reason_type"),(String)r.get("display_text"))).toList();
        var differences=RecommendationView.majorDifferencesList().stream().map(d->new RecommendationView.MajorDifference(d.majorCode(),d.name(),d.description(),majors.availability(d.majorCode().name()))).toList();
        return new View("NEXT",id,(String)row.get("run_public_id"),(String)row.get("profile_public_id"),(String)row.get("rule_version"),(String)row.get("explanation_version"),strings(row.get("completed_major_codes_json")),(String)row.get("primary_major_code"),strings(row.get("alternative_order_json")),reasons,differences,DbTimes.instant(row.get("generated_at")));
    }
    public View latest(long student){var rows=db.queryForList("SELECT n.public_id FROM mp_experience_run r LEFT JOIN mp_recommendation n ON n.source_run_id=r.id AND n.recommendation_type='NEXT' WHERE r.student_id=? AND "+ProductEligibility.sql("r")+" AND r.content_kind='MAJOR' AND r.status='CLOSED' ORDER BY r.closed_at DESC,r.id DESC LIMIT 1",student);return rows.isEmpty()||rows.getFirst().get("public_id")==null?null:owned(student,(String)rows.getFirst().get("public_id"));}
    public NextProjection projection(long student,Long run){
        var rows=run==null?db.queryForList("SELECT r.id FROM mp_experience_run r WHERE r.student_id=? AND "+ProductEligibility.sql("r")+" AND r.content_kind='MAJOR' AND r.status='CLOSED' ORDER BY r.closed_at DESC,r.id DESC LIMIT 1",student):db.queryForList("SELECT r.id FROM mp_experience_run r WHERE r.id=? AND r.student_id=? AND "+ProductEligibility.sql("r")+" AND r.content_kind='MAJOR' AND r.status='CLOSED'",run,student);
        if(rows.isEmpty())throw new ApiException(409,"REPORT_SOURCE_INVALID");long source=((Number)rows.getFirst().get("id")).longValue();
        var next=db.queryForList("SELECT public_id FROM mp_recommendation WHERE source_run_id=? AND student_id=? AND recommendation_type='NEXT'",source,student);
        if(next.isEmpty()){var completed=db.queryForList("SELECT DISTINCT m.code FROM mp_experience_run r JOIN mp_major m ON m.id=r.major_id WHERE r.student_id=? AND "+ProductEligibility.sql("r")+" AND r.status='CLOSED' ORDER BY m.code",String.class,student);if(completed.size()!=3)throw new ApiException(409,"REPORT_SOURCE_INVALID");String runId=db.queryForObject("SELECT public_id FROM mp_experience_run WHERE id=?",String.class,source);return new NextProjection("ALL_COMPLETED",null,runId,"next-recommendation-v1",completed,null,List.of(),List.of("ALL_COMPLETED"));}
        var v=owned(student,(String)next.getFirst().get("public_id"));return new NextProjection("RECOMMENDED",v.recommendationId(),v.sourceRunId(),v.ruleVersion(),v.completedMajorCodes(),v.primaryMajor(),v.alternativeMajors(),v.reasons().stream().map(Reason::code).toList());
    }
}
