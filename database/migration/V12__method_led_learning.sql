-- Additive learning records. Version 1 Runs remain version 1, including closed/adopted Runs.
ALTER TABLE mp_experience_run
 ADD COLUMN experience_edition INT UNSIGNED NOT NULL DEFAULT 1,
 ADD COLUMN learning_events_json JSON NULL,
 ADD COLUMN local_results_json JSON NULL,
 MODIFY COLUMN lane_key VARCHAR(80) GENERATED ALWAYS AS
   (CASE WHEN run_mode='REVIEW_PREVIEW' THEN CONCAT('preview:',major_id,':',task_version_id)
         WHEN content_kind='MAJOR' AND experience_edition>1 THEN CONCAT('major:',major_id,':edition:',experience_edition)
         WHEN content_kind='MAJOR' THEN CONCAT('major:',major_id) ELSE CONCAT('demo:',demo_key) END) STORED,
 ADD CONSTRAINT ck_experience_edition CHECK(experience_edition IN (1,2));

ALTER TABLE mp_background_job DROP CHECK ck_job_type_owner,
 ADD CONSTRAINT ck_job_type_owner CHECK(
   (job_type IN ('EVIDENCE_BUILD','EVIDENCE_REBUILD','REPORT_GENERATE','COMPARISON_GENERATE','METHOD_REPORT','STUDENT_EXPORT','ACCOUNT_DELETE')
     AND owner_student_id IS NOT NULL AND owner_operator_id IS NULL) OR
   (job_type='ADMIN_EXPORT' AND owner_student_id IS NULL AND owner_operator_id IS NOT NULL) OR
   (job_type='RETENTION_CLEANUP' AND owner_student_id IS NULL AND owner_operator_id IS NULL));
