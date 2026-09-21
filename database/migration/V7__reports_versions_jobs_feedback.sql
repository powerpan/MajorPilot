CREATE TABLE mp_report_version (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE,
 report_id BIGINT UNSIGNED NOT NULL, version_no BIGINT UNSIGNED NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'GENERATING', generation_phase VARCHAR(24) NOT NULL DEFAULT 'WAITING_EVIDENCE',
 generation_mode VARCHAR(32), request_manifest_json JSON NOT NULL, request_manifest_sha256 CHAR(64) NOT NULL,
 input_manifest_json JSON, source_manifest_sha256 CHAR(64), evidence_snapshot_ids_json JSON, decision_profile_ids_json JSON,
 next_recommendation_id BIGINT UNSIGNED, template_version VARCHAR(80) NOT NULL, prompt_version VARCHAR(80) NOT NULL,
 schema_version VARCHAR(80) NOT NULL, claim_rule_version VARCHAR(80) NOT NULL, claim_catalog_sha256 CHAR(64),
 model VARCHAR(100), structured_report_json JSON, report_body_sha256 CHAR(64), validation_result_json JSON,
 retry_no INT UNSIGNED NOT NULL DEFAULT 0, http_attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
 external_started_at DATETIME(3), external_deadline_at DATETIME(3), rendered_at DATETIME(3), failure_code VARCHAR(80),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3),
 FOREIGN KEY(report_id) REFERENCES mp_report(id), FOREIGN KEY(next_recommendation_id) REFERENCES mp_recommendation(id),
 UNIQUE(report_id,version_no), CHECK(status IN ('GENERATING','READY','SUPERSEDED','FAILED')),
 CHECK(generation_phase IN ('WAITING_EVIDENCE','PREPARED','INITIAL_REQUESTED','REPAIR_REQUESTED','FALLBACK_PENDING','VALIDATED','PUBLISHED')),
 CHECK(generation_mode IS NULL OR generation_mode IN ('AI','DETERMINISTIC_FALLBACK')), CHECK(retry_no<=1), CHECK(http_attempt_count<=3)
) ENGINE=InnoDB;
ALTER TABLE mp_report ADD COLUMN generation_target_version_id BIGINT UNSIGNED,
 ADD CONSTRAINT fk_report_current_version FOREIGN KEY(current_version_id) REFERENCES mp_report_version(id),
 ADD CONSTRAINT fk_report_target_version FOREIGN KEY(generation_target_version_id) REFERENCES mp_report_version(id);
CREATE TABLE mp_report_claim (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, report_version_id BIGINT UNSIGNED NOT NULL,
 section_key VARCHAR(64) NOT NULL, claim_order INT UNSIGNED NOT NULL, claim_type VARCHAR(32) NOT NULL,
 claim_text TEXT NOT NULL, confidence_code VARCHAR(32) NOT NULL, statement_key VARCHAR(200) NOT NULL,
 claim_rule_version VARCHAR(80) NOT NULL, major_code VARCHAR(32), dimension_key VARCHAR(64), rule_refs_json JSON NOT NULL,
 FOREIGN KEY(report_version_id) REFERENCES mp_report_version(id), UNIQUE(report_version_id,section_key,claim_order),
 CHECK(claim_type IN ('OBSERVED_FACT','STUDENT_SELF_REPORT','BOUNDED_INTERPRETATION','LIMITATION','NEXT_STEP'))
) ENGINE=InnoDB;
CREATE TABLE mp_report_claim_evidence (
 report_claim_id BIGINT UNSIGNED NOT NULL, evidence_item_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(report_claim_id,evidence_item_id), FOREIGN KEY(report_claim_id) REFERENCES mp_report_claim(id),
 FOREIGN KEY(evidence_item_id) REFERENCES mp_evidence_item(id)
) ENGINE=InnoDB;
CREATE TABLE mp_comparison_source (
 comparison_report_version_id BIGINT UNSIGNED NOT NULL, source_experience_report_version_id BIGINT UNSIGNED NOT NULL,
 major_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY(comparison_report_version_id,major_id),
 UNIQUE(comparison_report_version_id,source_experience_report_version_id),
 FOREIGN KEY(comparison_report_version_id) REFERENCES mp_report_version(id),
 FOREIGN KEY(source_experience_report_version_id) REFERENCES mp_report_version(id), FOREIGN KEY(major_id) REFERENCES mp_major(id)
) ENGINE=InnoDB;
CREATE TABLE mp_student_feedback (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, student_id BIGINT UNSIGNED NOT NULL,
 feedback_type VARCHAR(16) NOT NULL, context_type VARCHAR(24), experience_run_id BIGINT UNSIGNED,
 report_id BIGINT UNSIGNED, report_version_id BIGINT UNSIGNED, major_id BIGINT UNSIGNED, task_version_id BIGINT UNSIGNED,
 rating INT, comment_text TEXT, survey_version VARCHAR(80), answers_json JSON, diagnostic_code VARCHAR(80),
 status VARCHAR(16) NOT NULL DEFAULT 'RECEIVED', first_valid_survey BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id), FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id),
 FOREIGN KEY(report_id) REFERENCES mp_report(id), FOREIGN KEY(report_version_id) REFERENCES mp_report_version(id),
 FOREIGN KEY(major_id) REFERENCES mp_major(id), FOREIGN KEY(task_version_id) REFERENCES mp_task_version(id),
 CHECK(feedback_type IN ('GENERAL','TASK','REPORT','TECHNICAL')), CHECK(rating IS NULL OR rating BETWEEN 1 AND 5),
 CHECK(context_type IS NULL OR context_type IN ('EXPERIENCE_RUN','REPORT_VERSION')), INDEX(student_id,created_at)
) ENGINE=InnoDB;
ALTER TABLE mp_ai_call DROP CHECK mp_ai_call_chk_1,
 MODIFY COLUMN duration_ms BIGINT UNSIGNED NULL,
 ADD COLUMN report_version_id BIGINT UNSIGNED, ADD COLUMN invocation_id CHAR(26), ADD COLUMN generation_stage VARCHAR(16),
 ADD CONSTRAINT fk_ai_report_version FOREIGN KEY(report_version_id) REFERENCES mp_report_version(id),
 ADD CONSTRAINT ck_ai_call_status CHECK(status IN ('IN_PROGRESS','SUCCEEDED','FALLBACK','FAILED','UNKNOWN')),
 ADD UNIQUE(invocation_id);
ALTER TABLE mp_evidence_snapshot ADD COLUMN origin_job_id BIGINT UNSIGNED,
 ADD CONSTRAINT fk_evidence_origin_job FOREIGN KEY(origin_job_id) REFERENCES mp_background_job(id);
ALTER TABLE mp_product_event ADD COLUMN report_id BIGINT UNSIGNED, ADD COLUMN report_version_id BIGINT UNSIGNED,
 ADD COLUMN feedback_id BIGINT UNSIGNED,
 ADD CONSTRAINT fk_event_report FOREIGN KEY(report_id) REFERENCES mp_report(id),
 ADD CONSTRAINT fk_event_report_version FOREIGN KEY(report_version_id) REFERENCES mp_report_version(id),
 ADD CONSTRAINT fk_event_feedback FOREIGN KEY(feedback_id) REFERENCES mp_student_feedback(id);
