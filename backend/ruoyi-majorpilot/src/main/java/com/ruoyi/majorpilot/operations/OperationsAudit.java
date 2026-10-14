package com.ruoyi.majorpilot.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ruoyi.majorpilot.shared.*;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service @Profile({"local","pilot"})
public class OperationsAudit {
    private final JdbcTemplate db;private final ObjectMapper mapper;
    public OperationsAudit(JdbcTemplate db,ObjectMapper mapper){this.db=db;this.mapper=mapper;}
    public void operator(long id,boolean exportPermission,boolean lock){
        var rows=db.queryForList("SELECT user_id FROM sys_user WHERE user_id=? AND status='0' AND del_flag='0'"+(lock?" FOR UPDATE":""),id);
        if(rows.isEmpty())throw new ApiException(403,"PERMISSION_DENIED");
        if(exportPermission&&id!=1&&db.queryForList("SELECT r.role_id FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id JOIN sys_role_menu rm ON rm.role_id=r.role_id JOIN sys_menu m ON m.menu_id=rm.menu_id WHERE ur.user_id=? AND r.status='0' AND r.del_flag='0' AND m.status='0' AND m.perms='majorpilot:export:create'"+(lock?" FOR SHARE":""),id).isEmpty())throw new ApiException(403,"PERMISSION_DENIED");
    }
    public static void purpose(String purpose,String reason){if(purpose==null||!Set.of("SUPPORT_REQUEST","QUALITY_REVIEW","INCIDENT_REVIEW","PRODUCT_ANALYSIS").contains(purpose)||reason==null||reason.isBlank()||reason.codePointCount(0,reason.length())<10||reason.codePointCount(0,reason.length())>500)throw OperationsQuery.invalid();}
    public void analyticsOperator(long id,boolean lock){operator(id,false,lock);if(id!=1&&db.queryForList("SELECT r.role_id FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id JOIN sys_role_menu rm ON rm.role_id=r.role_id JOIN sys_menu m ON m.menu_id=rm.menu_id WHERE ur.user_id=? AND r.status='0' AND r.del_flag='0' AND m.status='0' AND m.perms='majorpilot:analytics:manage'"+(lock?" FOR SHARE":""),id).isEmpty())throw new ApiException(403,"PERMISSION_DENIED");}
    public void write(long operator,Long student,String action,String type,String id,String reasonCode,String reason,Object before,Object after,String request){
        db.update("INSERT INTO mp_sensitive_audit(public_id,operator_id,owner_student_id,action_code,target_type,target_public_id,reason_code,reason_text,before_summary_json,after_summary_json,correlation_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",PublicIds.next(),operator,student,action,type,id,reasonCode,reason,json(before),json(after),request);
    }
    private String json(Object value){try{return mapper.writeValueAsString(value);}catch(Exception bad){throw new IllegalArgumentException("Audit projection invalid");}}
}
