-- Explicit owner authorization is separate from professional content approval.
CREATE TABLE mp_local_task_release (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 task_version_id BIGINT UNSIGNED NOT NULL UNIQUE,
 manifest_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 authority_code VARCHAR(40) NOT NULL,
 authorization_reference VARCHAR(120) NOT NULL,
 reason_text VARCHAR(1000) NOT NULL,
 authorized_by_operator_id BIGINT NOT NULL,
 authorized_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CONSTRAINT fk_local_release_task FOREIGN KEY (task_version_id) REFERENCES mp_task_version(id),
 CONSTRAINT fk_local_release_operator FOREIGN KEY (authorized_by_operator_id) REFERENCES sys_user(user_id),
 CONSTRAINT ck_local_release_authority CHECK (authority_code='PROJECT_OWNER_REQUEST'),
 CONSTRAINT ck_local_release_sha CHECK (REGEXP_LIKE(manifest_sha256,'^[0-9a-f]{64}$','c'))
);

CREATE TABLE mp_run_product_adoption (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NOT NULL,
 experience_run_id BIGINT UNSIGNED NOT NULL UNIQUE,
 task_version_id BIGINT UNSIGNED NOT NULL,
 decision_profile_id BIGINT UNSIGNED NOT NULL,
 task_manifest_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 closed_input_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 original_run_mode VARCHAR(24) NOT NULL,
 authority_code VARCHAR(40) NOT NULL,
 authorization_reference VARCHAR(120) NOT NULL,
 reason_text VARCHAR(1000) NOT NULL,
 authorized_by_operator_id BIGINT NOT NULL,
 authorized_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX ix_product_adoption_student (student_id,experience_run_id),
 CONSTRAINT fk_product_adoption_student FOREIGN KEY (student_id) REFERENCES mp_student_account(id),
 CONSTRAINT fk_product_adoption_run FOREIGN KEY (experience_run_id) REFERENCES mp_experience_run(id),
 CONSTRAINT fk_product_adoption_task FOREIGN KEY (task_version_id) REFERENCES mp_task_version(id),
 CONSTRAINT fk_product_adoption_profile FOREIGN KEY (decision_profile_id) REFERENCES mp_decision_profile(id),
 CONSTRAINT fk_product_adoption_operator FOREIGN KEY (authorized_by_operator_id) REFERENCES sys_user(user_id),
 CONSTRAINT ck_product_adoption_mode CHECK (original_run_mode='REVIEW_PREVIEW'),
 CONSTRAINT ck_product_adoption_authority CHECK (authority_code='PROJECT_OWNER_REQUEST'),
 CONSTRAINT ck_product_adoption_task_sha CHECK (REGEXP_LIKE(task_manifest_sha256,'^[0-9a-f]{64}$','c')),
 CONSTRAINT ck_product_adoption_closed_sha CHECK (REGEXP_LIKE(closed_input_sha256,'^[0-9a-f]{64}$','c'))
);
