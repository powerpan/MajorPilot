-- Versioned content and P2 run engine. DEMO is not a fourth Major.
CREATE TABLE mp_major (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(32) NOT NULL UNIQUE,
 name_zh VARCHAR(80) NOT NULL, name_en VARCHAR(100) NOT NULL, description VARCHAR(500) NOT NULL,
 display_order INT NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
 CHECK(code IN ('AI','DATA_SCIENCE','BUSINESS_ANALYTICS')), CHECK(status IN ('ACTIVE','INACTIVE'))
) ENGINE=InnoDB;
INSERT INTO mp_major(code,name_zh,name_en,description,display_order) VALUES
 ('AI','人工智能','Artificial Intelligence','检查模型输出、迭代与使用边界',1),
 ('DATA_SCIENCE','数据科学','Data Science','检查数据、推理与不确定性',2),
 ('BUSINESS_ANALYTICS','商业分析','Business Analytics','指标诊断、行动与验证',3);

CREATE TABLE mp_task_version (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE,
 content_kind VARCHAR(16) NOT NULL, major_id BIGINT UNSIGNED NULL, demo_key VARCHAR(40) NULL,
 version_code VARCHAR(80) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
 manifest_path VARCHAR(255) NOT NULL, manifest_sha256 CHAR(64) NOT NULL, data_sha256 CHAR(64) NOT NULL,
 content_schema_version VARCHAR(80) NOT NULL, manifest_json JSON NOT NULL,
 published_at DATETIME(3), retired_at DATETIME(3), reviewed_by_operator_id BIGINT NULL,
 review_note VARCHAR(1000), review_checks_json JSON NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 lane_key VARCHAR(80) GENERATED ALWAYS AS (CASE WHEN content_kind='MAJOR' THEN CONCAT('major:',major_id) ELSE CONCAT('demo:',demo_key) END) STORED,
 published_guard TINYINT GENERATED ALWAYS AS (CASE WHEN status='PUBLISHED' THEN 1 ELSE NULL END) STORED,
 FOREIGN KEY(major_id) REFERENCES mp_major(id),
 UNIQUE(lane_key,version_code), UNIQUE(lane_key,published_guard),
 CHECK(status IN ('DRAFT','REVIEW','PUBLISHED','RETIRED')),
 CHECK((content_kind='MAJOR' AND major_id IS NOT NULL AND demo_key IS NULL) OR (content_kind='DEMO' AND major_id IS NULL AND demo_key IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE mp_experience_run (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NOT NULL, content_kind VARCHAR(16) NOT NULL, major_id BIGINT UNSIGNED NULL, demo_key VARCHAR(40) NULL,
 task_version_id BIGINT UNSIGNED NULL, source_recommendation_id BIGINT UNSIGNED NULL, source_decision_id BIGINT UNSIGNED NULL, decision_profile_id BIGINT UNSIGNED NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'READY', paused_from_status VARCHAR(20), attempt_no INT UNSIGNED NOT NULL DEFAULT 1,
 origin_run_id BIGINT UNSIGNED NULL, created_reason VARCHAR(24) NOT NULL DEFAULT 'STUDENT_START', current_step_key VARCHAR(40),
 started_at DATETIME(3), task_completed_at DATETIME(3), reflection_completed_at DATETIME(3), closed_at DATETIME(3),
 paused_at DATETIME(3), replaced_at DATETIME(3), last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 closed_input_manifest_json JSON NULL, closed_input_sha256 CHAR(64) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 active_guard TINYINT GENERATED ALWAYS AS (CASE WHEN status IN ('IN_PROGRESS','TASK_COMPLETED') THEN 1 ELSE NULL END) STORED,
 current_major_guard TINYINT GENERATED ALWAYS AS (CASE WHEN status<>'REPLACED' THEN 1 ELSE NULL END) STORED,
 lane_key VARCHAR(80) GENERATED ALWAYS AS (CASE WHEN content_kind='MAJOR' THEN CONCAT('major:',major_id) ELSE CONCAT('demo:',demo_key) END) STORED,
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id), FOREIGN KEY(major_id) REFERENCES mp_major(id),
 FOREIGN KEY(task_version_id) REFERENCES mp_task_version(id), FOREIGN KEY(source_recommendation_id) REFERENCES mp_recommendation(id),
 FOREIGN KEY(source_decision_id) REFERENCES mp_recommendation_decision(id), FOREIGN KEY(decision_profile_id) REFERENCES mp_decision_profile(id), FOREIGN KEY(origin_run_id) REFERENCES mp_experience_run(id),
 UNIQUE(student_id,active_guard), UNIQUE(student_id,lane_key,current_major_guard), UNIQUE(student_id,lane_key,attempt_no),
 INDEX(student_id,status,last_activity_at),
 CHECK(status IN ('READY','IN_PROGRESS','TASK_COMPLETED','PAUSED','CLOSED','REPLACED')),
 CHECK((status='PAUSED' AND paused_from_status IN ('IN_PROGRESS','TASK_COMPLETED')) OR (status<>'PAUSED' AND paused_from_status IS NULL)),
 CHECK((content_kind='MAJOR' AND major_id IS NOT NULL AND demo_key IS NULL AND source_decision_id IS NOT NULL AND source_recommendation_id IS NOT NULL) OR (content_kind='DEMO' AND major_id IS NULL AND demo_key IS NOT NULL AND source_decision_id IS NULL AND source_recommendation_id IS NULL)),
 CHECK(status IN ('READY','REPLACED') OR (task_version_id IS NOT NULL AND decision_profile_id IS NOT NULL)),
 CHECK((created_reason='STUDENT_START' AND attempt_no=1 AND origin_run_id IS NULL) OR (created_reason='OPERATOR_RECOVERY' AND attempt_no>1 AND origin_run_id IS NOT NULL)),
 CHECK(status<>'CLOSED' OR (closed_input_manifest_json IS NOT NULL AND closed_input_sha256 IS NOT NULL AND closed_at IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE mp_step_state (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, experience_run_id BIGINT UNSIGNED NOT NULL, step_key VARCHAR(40) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'NOT_STARTED', current_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 first_started_at DATETIME(3), last_saved_at DATETIME(3), completed_at DATETIME(3), row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id), UNIQUE(experience_run_id,step_key),
 CHECK(status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED'))
) ENGINE=InnoDB;
CREATE TABLE mp_step_response_revision (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, step_state_id BIGINT UNSIGNED NOT NULL, revision_no BIGINT UNSIGNED NOT NULL,
 response_schema_version VARCHAR(80) NOT NULL, response_json JSON NOT NULL, normalized_result_json JSON NULL,
 validation_status VARCHAR(24) NOT NULL DEFAULT 'VALID', client_saved_at DATETIME(3), received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), content_sha256 CHAR(64) NOT NULL,
 FOREIGN KEY(step_state_id) REFERENCES mp_step_state(id), UNIQUE(step_state_id,revision_no), CHECK(revision_no>0), CHECK(validation_status IN ('VALID','INCOMPLETE'))
) ENGINE=InnoDB;
CREATE TABLE mp_execution_record (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, request_public_id VARCHAR(128) NOT NULL UNIQUE,
 experience_run_id BIGINT UNSIGNED NOT NULL, step_key VARCHAR(40) NOT NULL, engine_type VARCHAR(40) NOT NULL, engine_version VARCHAR(80) NOT NULL,
 operation_key VARCHAR(80) NOT NULL, input_revision BIGINT UNSIGNED NOT NULL, trust_level VARCHAR(24) NOT NULL,
 evaluation_config_sha256 CHAR(64) NULL, input_sha256 CHAR(64) NOT NULL, status VARCHAR(16) NOT NULL,
 result_json JSON NULL, error_code VARCHAR(80), duration_ms BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id), UNIQUE(experience_run_id,operation_key,evaluation_config_sha256),
 INDEX(experience_run_id,step_key,input_revision),
 CHECK(trust_level IN ('SERVER_VERIFIED','CLIENT_OBSERVED')), CHECK(status IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED')),
 CHECK(evaluation_config_sha256 IS NULL OR status='SUCCEEDED')
) ENGINE=InnoDB;
-- A reused immutable execution can support a later response revision without rewriting either record.
CREATE TABLE mp_response_execution (
 response_revision_id BIGINT UNSIGNED NOT NULL, execution_record_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(response_revision_id,execution_record_id), FOREIGN KEY(response_revision_id) REFERENCES mp_step_response_revision(id), FOREIGN KEY(execution_record_id) REFERENCES mp_execution_record(id)
) ENGINE=InnoDB;
CREATE TABLE mp_hint_request (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, experience_run_id BIGINT UNSIGNED NOT NULL,
 step_key VARCHAR(40) NOT NULL, hint_level TINYINT UNSIGNED NOT NULL, input_revision BIGINT UNSIGNED NOT NULL,
 request_context_json JSON NOT NULL, response_json JSON NULL, provider VARCHAR(40), model VARCHAR(80), prompt_version VARCHAR(80),
 status VARCHAR(16) NOT NULL, ai_call_id CHAR(26), requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3),
 FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id), INDEX(experience_run_id,step_key,requested_at),
 CHECK(hint_level BETWEEN 1 AND 3), CHECK(status IN ('PENDING','SUCCEEDED','FALLBACK','FAILED'))
) ENGINE=InnoDB;
CREATE TABLE mp_reflection (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, experience_run_id BIGINT UNSIGNED NOT NULL UNIQUE,
 question_set_version VARCHAR(80) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'DRAFT', draft_json JSON NOT NULL,
 follow_up_json JSON NULL, submitted_at DATETIME(3), row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id), CHECK(status IN ('DRAFT','SUBMITTED'))
) ENGINE=InnoDB;
CREATE TABLE mp_reflection_answer (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, reflection_id BIGINT UNSIGNED NOT NULL, question_key VARCHAR(80) NOT NULL, answer_json JSON NOT NULL,
 answer_text TEXT NULL, answer_source VARCHAR(24) NOT NULL, ai_question_text VARCHAR(1000), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(reflection_id) REFERENCES mp_reflection(id), UNIQUE(reflection_id,question_key), CHECK(answer_source IN ('FIXED_QUESTION','AI_FOLLOW_UP'))
) ENGINE=InnoDB;
-- Closure is durable and tied to the frozen input; P2 DEMO never creates a professional report.
CREATE TABLE mp_run_closure_request (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, experience_run_id BIGINT UNSIGNED NOT NULL UNIQUE,
 closed_input_sha256 CHAR(64) NOT NULL, content_kind VARCHAR(16) NOT NULL, status VARCHAR(24) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id),
 CHECK(content_kind IN ('DEMO','MAJOR')), CHECK(status IN ('DEMO_COMPLETE','PENDING'))
) ENGINE=InnoDB;
CREATE TABLE mp_sensitive_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, public_id CHAR(26) NOT NULL UNIQUE, operator_id BIGINT NOT NULL,
 action_code VARCHAR(80) NOT NULL, target_type VARCHAR(80) NOT NULL, target_public_id CHAR(26) NOT NULL,
 reason_code VARCHAR(80) NOT NULL, reason_text VARCHAR(1000) NOT NULL,
 before_summary_json JSON NOT NULL, after_summary_json JSON NOT NULL, occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), correlation_id VARCHAR(80) NOT NULL
) ENGINE=InnoDB;
ALTER TABLE mp_product_event
 ADD COLUMN experience_run_id BIGINT UNSIGNED NULL, ADD COLUMN task_version_id BIGINT UNSIGNED NULL,
 ADD COLUMN major_code VARCHAR(32) NULL, ADD COLUMN step_key VARCHAR(40) NULL,
 ADD FOREIGN KEY(experience_run_id) REFERENCES mp_experience_run(id), ADD FOREIGN KEY(task_version_id) REFERENCES mp_task_version(id),
 ADD INDEX(experience_run_id,occurred_at);
