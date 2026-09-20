package com.ruoyi.majorpilot.recommendation;

import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Current publication availability is a projection, never a rewrite of historical ranking. */
@Service @Profile("local")
public class MajorCatalog {
    private final JdbcTemplate db;
    public MajorCatalog(JdbcTemplate db){this.db=db;}
    public String availability(String code){return db.queryForObject("SELECT COUNT(*) FROM mp_task_version t JOIN mp_major m ON m.id=t.major_id WHERE m.code=? AND m.status='ACTIVE' AND t.content_kind='MAJOR' AND t.status='PUBLISHED'",Integer.class,code)>0?"AVAILABLE":"UNAVAILABLE";}
    public List<RecommendationView.MajorDifference> majors(){return RecommendationView.majorDifferencesList().stream().map(m->new RecommendationView.MajorDifference(m.majorCode(),m.name(),m.description(),availability(m.majorCode().name()))).toList();}
    public RecommendationView project(RecommendationView v){return new RecommendationView(v.decisionProfileId(),v.recommendationId(),v.profileVersion(),v.questionnaireVersion(),v.ruleVersion(),v.explanationVersion(),v.primaryMajor(),v.alternativeMajors(),v.reasons(),v.tieDetected(),v.tieBreakRule(),majors(),v.supportNotes(),v.explanationStatus(),v.generatedAt(),v.canRegister(),availability(v.primaryMajor().name()));}
    public List<Map<String,Object>> dashboard(long student){return majors().stream().map(m->{var rows=db.queryForList("SELECT r.status FROM mp_experience_run r JOIN mp_major m ON m.id=r.major_id WHERE r.student_id=? AND m.code=? AND r.run_mode='STANDARD' AND r.status<>'REPLACED' ORDER BY r.id DESC LIMIT 1",student,m.majorCode().name());return Map.<String,Object>of("majorCode",m.majorCode(),"name",m.name(),"status",rows.isEmpty()?"NOT_STARTED":rows.getFirst().get("status"),"availability",m.availability());}).toList();}
}
