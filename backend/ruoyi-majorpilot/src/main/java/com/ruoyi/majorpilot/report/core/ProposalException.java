package com.ruoyi.majorpilot.report.core;
import java.util.List;
import com.ruoyi.majorpilot.report.core.ReportModels.Violation;
/** Only safe structural/selection issues; never includes model output or unknown field names. */
public final class ProposalException extends RuntimeException {
    public final List<Violation> issues;
    public ProposalException(List<Violation> issues){super("REPORT_PROPOSAL_INVALID");this.issues=List.copyOf(issues.stream().limit(20).toList());}
}
