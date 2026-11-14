-- Drafts are private account data, separate from immutable submitted profile versions.
-- The revision survives submit/discard to prevent stale tabs from recreating old drafts.
ALTER TABLE mp_student_account
 ADD COLUMN profile_draft_json JSON NULL,
 ADD COLUMN profile_draft_revision BIGINT UNSIGNED NOT NULL DEFAULT 0;

-- Directly selected majors bind a real profile (possibly explicitly empty), with no invented recommendation/decision.
ALTER TABLE mp_experience_run DROP CHECK ck_run_identity;
ALTER TABLE mp_experience_run ADD CONSTRAINT ck_run_identity CHECK (
 (content_kind='MAJOR' AND major_id IS NOT NULL AND demo_key IS NULL AND
   ((run_mode='STANDARD' AND
     ((source_decision_id IS NOT NULL AND source_recommendation_id IS NOT NULL) OR
      (source_decision_id IS NULL AND source_recommendation_id IS NULL AND decision_profile_id IS NOT NULL))) OR
    (run_mode='REVIEW_PREVIEW' AND task_version_id IS NOT NULL AND source_decision_id IS NULL AND source_recommendation_id IS NULL))) OR
 (content_kind='DEMO' AND run_mode='STANDARD' AND major_id IS NULL AND demo_key IS NOT NULL AND source_decision_id IS NULL AND source_recommendation_id IS NULL)
);
