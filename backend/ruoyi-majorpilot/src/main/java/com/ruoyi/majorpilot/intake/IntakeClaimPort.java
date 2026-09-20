package com.ruoyi.majorpilot.intake;

/** Registration invokes this inside its account-creation transaction. Never REQUIRES_NEW. */
public interface IntakeClaimPort {
    record ClaimableIntake(long intakeInternalId, long latestProfileInternalId, String questionnaireVersion, String acquisitionChannelCode) {}
    ClaimableIntake lockClaimable(String publicId, String secretHash);
    void claimAll(long intakeInternalId, long studentInternalId);
}
