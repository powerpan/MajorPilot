-- Preserve the P0 prototype queue; its owner is a synthetic actor, never a Student.
RENAME TABLE mp_background_job TO mp_p0_background_job;

ALTER TABLE mp_experience_run
 ADD COLUMN run_mode VARCHAR(16) NOT NULL DEFAULT 'STANDARD',
 DROP CHECK mp_experience_run_chk_3,
 MODIFY COLUMN lane_key VARCHAR(80) GENERATED ALWAYS AS
   (CASE WHEN run_mode='REVIEW_PREVIEW' THEN CONCAT('preview:',major_id,':',task_version_id)
         WHEN content_kind='MAJOR' THEN CONCAT('major:',major_id) ELSE CONCAT('demo:',demo_key) END) STORED,
 ADD CONSTRAINT ck_run_mode CHECK(run_mode IN ('STANDARD','REVIEW_PREVIEW')),
 ADD CONSTRAINT ck_run_identity CHECK(
   (content_kind='MAJOR' AND major_id IS NOT NULL AND demo_key IS NULL AND
     ((run_mode='STANDARD' AND source_decision_id IS NOT NULL AND source_recommendation_id IS NOT NULL) OR
      (run_mode='REVIEW_PREVIEW' AND task_version_id IS NOT NULL AND source_decision_id IS NULL AND source_recommendation_id IS NULL))) OR
   (content_kind='DEMO' AND run_mode='STANDARD' AND major_id IS NULL AND demo_key IS NOT NULL AND source_decision_id IS NULL AND source_recommendation_id IS NULL));

ALTER TABLE mp_execution_record
 ADD COLUMN source_revisions_json JSON NULL,
 ADD COLUMN counts_against_quota BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE mp_response_execution
 DROP PRIMARY KEY,
 ADD COLUMN source_revisions_json JSON NULL,
 ADD COLUMN source_binding_sha256 CHAR(64) NOT NULL DEFAULT '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
 ADD PRIMARY KEY(response_revision_id,execution_record_id,source_binding_sha256);

CREATE TABLE mp_background_job (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE,
 job_type VARCHAR(32) NOT NULL, business_key VARCHAR(180) NOT NULL UNIQUE,
 owner_student_id BIGINT UNSIGNED NOT NULL, target_type VARCHAR(40) NOT NULL, target_id BIGINT UNSIGNED NOT NULL, target_version BIGINT UNSIGNED NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING', attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
 available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), lease_until DATETIME(3), lease_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 worker_id VARCHAR(80), checkpoint_json JSON NULL, last_error_code VARCHAR(80), started_at DATETIME(3), completed_at DATETIME(3),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(owner_student_id) REFERENCES mp_student_account(id), INDEX(status,available_at,lease_until), INDEX(owner_student_id),
 CHECK(status IN ('PENDING','RUNNING','RETRY_WAIT','SUCCEEDED','FAILED','CANCELLED'))
) ENGINE=InnoDB;
CREATE TABLE mp_evidence_snapshot (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NOT NULL, experience_run_id BIGINT UNSIGNED NOT NULL, snapshot_version_no BIGINT UNSIGNED NOT NULL,
 run_mode VARCHAR(16) NOT NULL, decision_profile_id BIGINT UNSIGNED NOT NULL, task_version_id BIGINT UNSIGNED NOT NULL,
 closed_input_sha256 CHAR(64) NOT NULL, evidence_rule_version VARCHAR(80) NOT NULL, status VARCHAR(16) NOT NULL,
 snapshot_sha256 CHAR(64), built_at DATETIME(3), failure_code VARCHAR(80), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id), FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id),
 FOREIGN KEY(decision_profile_id) REFERENCES mp_decision_profile(id), FOREIGN KEY(task_version_id) REFERENCES mp_task_version(id),
 UNIQUE(experience_run_id,snapshot_version_no), CHECK(status IN ('BUILDING','READY','FAILED')), CHECK(run_mode IN ('STANDARD','REVIEW_PREVIEW'))
) ENGINE=InnoDB;
CREATE TABLE mp_evidence_item (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, evidence_snapshot_id BIGINT UNSIGNED NOT NULL,
 evidence_key VARCHAR(120) NOT NULL, evidence_type VARCHAR(64) NOT NULL, source_type VARCHAR(40) NOT NULL, source_id BIGINT UNSIGNED NOT NULL,
 structured_value_json JSON NOT NULL, display_summary VARCHAR(1000) NOT NULL, allowed_claim_types_json JSON NOT NULL,
 sensitivity_class VARCHAR(24) NOT NULL, observed_at DATETIME(3) NOT NULL, rule_version VARCHAR(80) NOT NULL,
 FOREIGN KEY(evidence_snapshot_id) REFERENCES mp_evidence_snapshot(id), UNIQUE(evidence_snapshot_id,evidence_key)
) ENGINE=InnoDB;
CREATE TABLE mp_report (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, student_id BIGINT UNSIGNED NOT NULL,
 report_type VARCHAR(16) NOT NULL, experience_run_id BIGINT UNSIGNED NULL UNIQUE, major_id BIGINT UNSIGNED NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING', current_version_id BIGINT UNSIGNED NULL, next_recommendation_id BIGINT UNSIGNED NULL,
 requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ready_at DATETIME(3), first_ready_at DATETIME(3), row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 comparison_student_guard BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN report_type='COMPARISON' THEN student_id ELSE NULL END) STORED,
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id), FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id),
 FOREIGN KEY(major_id) REFERENCES mp_major(id), FOREIGN KEY(next_recommendation_id) REFERENCES mp_recommendation(id), UNIQUE(comparison_student_guard),
 CHECK(status IN ('PENDING','GENERATING','READY','FAILED')),
 CHECK((report_type='EXPERIENCE' AND experience_run_id IS NOT NULL AND major_id IS NOT NULL) OR (report_type='COMPARISON' AND experience_run_id IS NULL AND major_id IS NULL))
) ENGINE=InnoDB;
ALTER TABLE mp_recommendation ADD CONSTRAINT fk_recommendation_source_run FOREIGN KEY(source_run_id) REFERENCES mp_experience_run(id);
ALTER TABLE mp_product_event ADD COLUMN run_mode VARCHAR(16) NULL;
ALTER TABLE mp_run_closure_request DROP CHECK mp_run_closure_request_chk_2,
 ADD CONSTRAINT ck_closure_status CHECK(status IN ('DEMO_COMPLETE','PENDING','READY','FAILED'));

CREATE TABLE mp_ai_call (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NOT NULL, experience_run_id BIGINT UNSIGNED NULL, call_kind VARCHAR(32) NOT NULL,
 provider VARCHAR(40) NOT NULL, model VARCHAR(100), endpoint_region VARCHAR(40), prompt_version VARCHAR(80) NOT NULL,
 input_schema_version VARCHAR(80) NOT NULL, input_sha256 CHAR(64) NOT NULL, input_field_keys_json JSON NOT NULL,
 status VARCHAR(16) NOT NULL, duration_ms BIGINT UNSIGNED NOT NULL, http_attempts INT UNSIGNED NULL, repair_attempts INT UNSIGNED NULL,
 input_tokens BIGINT UNSIGNED NULL, output_tokens BIGINT UNSIGNED NULL, estimated_cost DECIMAL(18,8) NULL, error_code VARCHAR(80),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id), FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id),
 CHECK(status IN ('SUCCEEDED','FALLBACK','FAILED')), CHECK(repair_attempts<=1), INDEX(student_id,created_at)
) ENGINE=InnoDB;
