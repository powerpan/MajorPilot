-- P1 product data is separate from all synthetic mp_p0_* identities.
CREATE TABLE mp_student_account (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 email_normalized VARCHAR(254) COLLATE utf8mb4_bin NULL UNIQUE,
 email_display VARCHAR(254) NOT NULL,
 password_hash VARCHAR(255) NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'PENDING_VERIFICATION',
 email_verified_at DATETIME(3) NULL,
 failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
 locked_until DATETIME(3) NULL,
 last_login_at DATETIME(3) NULL,
 deletion_requested_at DATETIME(3) NULL, deleted_at DATETIME(3) NULL,
 row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 CONSTRAINT ck_student_status CHECK(status IN ('PENDING_VERIFICATION','ACTIVE','LOCKED','DELETION_PENDING','DELETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_student_session (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 student_id BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
 issued_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL,
 last_seen_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL,
 device_family VARCHAR(32) NULL, revoke_reason VARCHAR(64) NULL,
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 INDEX ix_session_student(student_id,status,expires_at),
 CONSTRAINT ck_session_status CHECK(status IN ('ACTIVE','REVOKED','EXPIRED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_email_token (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 student_id BIGINT UNSIGNED NOT NULL,
 purpose VARCHAR(32) NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 target_email_normalized VARCHAR(254) COLLATE utf8mb4_bin NULL,
 target_email_display VARCHAR(254) NULL,
 expires_at DATETIME(3) NOT NULL, used_at DATETIME(3) NULL, revoked_at DATETIME(3) NULL,
 request_ip_hash CHAR(64) CHARACTER SET ascii NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 INDEX ix_email_token_student(student_id,purpose,expires_at),
 CONSTRAINT ck_email_token_purpose CHECK(purpose IN ('VERIFY_EMAIL','CHANGE_EMAIL','RESET_PASSWORD'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_intake_session (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 secret_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 questionnaire_version VARCHAR(64) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'DRAFT', draft_json JSON NOT NULL,
 last_step_key VARCHAR(16) NOT NULL DEFAULT 'step-1',
 expires_at DATETIME(3) NOT NULL, claimed_student_id BIGINT UNSIGNED NULL,
 claimed_at DATETIME(3) NULL, row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(claimed_student_id) REFERENCES mp_student_account(id),
 INDEX ix_intake_expiry(status,expires_at),
 CONSTRAINT ck_intake_status CHECK(status IN ('DRAFT','SUBMITTED','CLAIMED','EXPIRED','PURGED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_consent_record (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 student_id BIGINT UNSIGNED NULL, intake_session_id BIGINT UNSIGNED NULL,
 document_type VARCHAR(24) NOT NULL, document_version VARCHAR(64) NOT NULL,
 decision VARCHAR(16) NOT NULL, source VARCHAR(32) NOT NULL DEFAULT 'STUDENT_WEB',
 decided_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 FOREIGN KEY(intake_session_id) REFERENCES mp_intake_session(id),
 INDEX ix_consent_student(student_id,document_type,decided_at),
 CONSTRAINT ck_consent_type CHECK(document_type IN ('TERMS','PRIVACY','RESEARCH')),
 CONSTRAINT ck_consent_decision CHECK(decision IN ('ACCEPTED','DECLINED','WITHDRAWN')),
 CONSTRAINT ck_consent_owner CHECK(student_id IS NOT NULL OR intake_session_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_decision_profile (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NULL, intake_session_id BIGINT UNSIGNED NULL,
 profile_version_no BIGINT UNSIGNED NOT NULL, source_draft_revision BIGINT UNSIGNED NULL,
 questionnaire_version VARCHAR(64) NOT NULL, submitted_at DATETIME(3) NOT NULL,
 profile_summary_json JSON NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'SUBMITTED',
 supersedes_profile_id BIGINT UNSIGNED NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 FOREIGN KEY(intake_session_id) REFERENCES mp_intake_session(id),
 FOREIGN KEY(supersedes_profile_id) REFERENCES mp_decision_profile(id),
 UNIQUE KEY uq_profile_student_version(student_id,profile_version_no),
 UNIQUE KEY uq_profile_intake_version(intake_session_id,profile_version_no),
 UNIQUE KEY uq_profile_intake_revision(intake_session_id,source_draft_revision),
 INDEX ix_profile_student(student_id,submitted_at),
 CONSTRAINT ck_profile_status CHECK(status IN ('SUBMITTED','CLAIMED','SUPERSEDED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_decision_answer (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 decision_profile_id BIGINT UNSIGNED NOT NULL, question_key VARCHAR(64) NOT NULL,
 answer_json JSON NOT NULL, answer_text_redacted VARCHAR(300) NULL,
 schema_version VARCHAR(64) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(decision_profile_id) REFERENCES mp_decision_profile(id),
 UNIQUE KEY uq_answer(decision_profile_id,question_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_recommendation (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NULL, decision_profile_id BIGINT UNSIGNED NOT NULL,
 recommendation_type VARCHAR(16) NOT NULL, source_run_id BIGINT UNSIGNED NULL,
 completed_major_codes_json JSON NOT NULL, rule_version VARCHAR(64) NOT NULL,
 primary_major_code VARCHAR(32) NOT NULL, alternative_order_json JSON NOT NULL,
 tie_detected BOOLEAN NOT NULL, tie_break_rule VARCHAR(64) NULL,
 explanation_status VARCHAR(24) NOT NULL, explanation_version VARCHAR(64) NOT NULL,
 safe_result_json JSON NOT NULL, generated_at DATETIME(3) NOT NULL,
 idempotency_key VARCHAR(128) NULL,
 initial_profile_guard BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN recommendation_type='INITIAL' THEN decision_profile_id ELSE NULL END) STORED,
 next_source_run_guard BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN recommendation_type='NEXT' THEN source_run_id ELSE NULL END) STORED,
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 FOREIGN KEY(decision_profile_id) REFERENCES mp_decision_profile(id),
 UNIQUE KEY uq_initial_recommendation(initial_profile_guard,rule_version),
 UNIQUE KEY uq_next_recommendation(next_source_run_guard,rule_version),
 CONSTRAINT ck_recommendation_type CHECK(recommendation_type IN ('INITIAL','NEXT')),
 CONSTRAINT ck_recommendation_major CHECK(primary_major_code IN ('AI','DATA_SCIENCE','BUSINESS_ANALYTICS')),
 CONSTRAINT ck_explanation_status CHECK(explanation_status IN ('STRUCTURED_ONLY','AI_READY','AI_FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_recommendation_reason (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 recommendation_id BIGINT UNSIGNED NOT NULL, reason_code VARCHAR(64) NOT NULL,
 reason_type VARCHAR(16) NOT NULL, major_code VARCHAR(32) NOT NULL,
 reason_order INT UNSIGNED NOT NULL, source_question_keys_json JSON NOT NULL,
 display_text VARCHAR(1000) NOT NULL, rule_version VARCHAR(64) NOT NULL,
 FOREIGN KEY(recommendation_id) REFERENCES mp_recommendation(id),
 UNIQUE KEY uq_reason_order(recommendation_id,reason_order),
 CONSTRAINT ck_reason_type CHECK(reason_type IN ('RANKING','CONTEXT','BOUNDARY'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_recommendation_decision (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 recommendation_id BIGINT UNSIGNED NOT NULL, student_id BIGINT UNSIGNED NOT NULL,
 decision_no BIGINT UNSIGNED NOT NULL, decision_type VARCHAR(16) NOT NULL,
 selected_major_code VARCHAR(32) NOT NULL, override_reason_code VARCHAR(64) NULL,
 override_text VARCHAR(300) NULL, decided_at DATETIME(3) NOT NULL,
 FOREIGN KEY(recommendation_id) REFERENCES mp_recommendation(id),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 UNIQUE KEY uq_decision_order(recommendation_id,decision_no),
 CONSTRAINT ck_decision_type CHECK(decision_type IN ('ACCEPTED','OVERRIDDEN')),
 CONSTRAINT ck_selected_major CHECK(selected_major_code IN ('AI','DATA_SCIENCE','BUSINESS_ANALYTICS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_idempotency_record (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 owner_student_id BIGINT UNSIGNED NULL, owner_intake_session_id BIGINT UNSIGNED NULL,
 scope_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hmac CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 status VARCHAR(16) NOT NULL, resource_type VARCHAR(64) NULL, resource_id BIGINT UNSIGNED NULL,
 safe_response_json JSON NULL, expires_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(owner_student_id) REFERENCES mp_student_account(id),
 FOREIGN KEY(owner_intake_session_id) REFERENCES mp_intake_session(id),
 UNIQUE KEY uq_idempotency(scope_hash,key_hash),
 INDEX ix_idempotency_expiry(expires_at),
 CONSTRAINT ck_idempotency_status CHECK(status IN ('PROCESSING','COMPLETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_security_event (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NULL, event_code VARCHAR(64) NOT NULL,
 source_hash CHAR(64) CHARACTER SET ascii NULL, request_id VARCHAR(64) NOT NULL,
 occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 INDEX ix_security_student(student_id,occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_product_event (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 client_event_id CHAR(36) CHARACTER SET ascii NULL,
 source_subject_hash CHAR(64) CHARACTER SET ascii NULL,
 event_name VARCHAR(64) NOT NULL,event_version VARCHAR(32) NOT NULL,source VARCHAR(16) NOT NULL,
 occurred_at DATETIME(3) NOT NULL,received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 student_id BIGINT UNSIGNED NULL,intake_session_id BIGINT UNSIGNED NULL,recommendation_id BIGINT UNSIGNED NULL,
 properties_json JSON NOT NULL,dedupe_key CHAR(64) CHARACTER SET ascii NULL UNIQUE,
 FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 FOREIGN KEY(intake_session_id) REFERENCES mp_intake_session(id),
 FOREIGN KEY(recommendation_id) REFERENCES mp_recommendation(id),
 UNIQUE KEY uq_client_event(source_subject_hash,client_event_id),
 INDEX ix_event_name(event_name,occurred_at),INDEX ix_event_student(student_id,occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
