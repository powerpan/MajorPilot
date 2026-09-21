package com.ruoyi.majorpilot.operations;

import java.time.Instant;
import java.util.*;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import static com.ruoyi.majorpilot.operations.OperationsDtos.*;
import static com.ruoyi.majorpilot.operations.OperationsService.*;

/** Technical state, not a claim that unobserved Student activity did not happen. */
@Service @Profile("local")
public class OperationsHealth {
    private final OperationsService ops;
    public OperationsHealth(OperationsService ops){this.ops=ops;}
    public Health status(long operator){ops.audit.operator(operator,false,false);return ops.tx.execute(t->{
        var jobs=ops.db.queryForList("SELECT job_type,status,COUNT(*) AS count FROM mp_background_job GROUP BY job_type,status ORDER BY job_type,status").stream().map(r->new JobCount(code(s(r,"job_type")),code(s(r,"status")),n(r,"count"))).toList();
        List<SafeError> errors=new ArrayList<>();for(String[] source:List.of(new String[]{"JOB","mp_background_job","last_error_code"},new String[]{"AI","mp_ai_call","error_code"},new String[]{"EXECUTION","mp_execution_record","error_code"})){for(var r:ops.db.queryForList("SELECT "+source[2]+" AS safe_code,COUNT(*) AS count FROM "+source[1]+" WHERE "+source[2]+" IS NOT NULL GROUP BY "+source[2]+" ORDER BY count DESC LIMIT 50"))errors.add(new SafeError(source[0],code(s(r,"safe_code")),n(r,"count")));}
        var retention=ops.db.queryForList("SELECT * FROM mp_retention_status ORDER BY policy_key").stream().map(r->new Retention(s(r,"policy_key"),time(r,"last_started_at"),time(r,"last_completed_at"),r.get("last_error_code")==null?null:code(s(r,"last_error_code")),n(r,"deleted_count"),time(r,"next_due_at"))).toList();
        long overdue=ops.db.queryForObject("SELECT COUNT(*) FROM mp_account_deletion_request WHERE confirmed_at<UTC_TIMESTAMP(3)-INTERVAL 30 DAY AND status NOT IN ('COMPLETED','CANCELLED')",Long.class);
        var reports=ops.db.queryForMap("SELECT COUNT(*) AS ready,COALESCE(SUM(generation_mode='DETERMINISTIC_FALLBACK'),0) AS fallback FROM mp_report_version WHERE status IN ('READY','SUPERSEDED')");
        var costs=ops.db.queryForMap("SELECT COALESCE(SUM(estimated_cost IS NULL),0) AS unknown_count,SUM(estimated_cost) AS known_cost FROM mp_ai_call");
        return new Health(Instant.now(),jobs,errors,overdue,n(reports,"ready"),n(reports,"fallback"),n(costs,"unknown_count"),(java.math.BigDecimal)costs.get("known_cost"),retention,List.of("技术健康是当前保留数据的运行状态，包含显式测试任务；不是正式产品指标分母。","费用未提供时保持未知；已知费用求和不代表完整成本。","错误分布每来源最多显示50个安全代码。","留存计数是各策略处理的记录或文件数，不是删除账户人数。匿名草稿和安全凭证仍由原有独立清理任务负责，本列表不推测其执行成功时间。"));
    });}
    static String code(String value){return value!=null&&value.matches("[A-Z][A-Z0-9_]{0,79}")?value:"UNCLASSIFIED_ERROR";}
}
