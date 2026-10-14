-- Invitation-only pilot. Activation is deliberately separate from email verification.
CREATE TABLE mp_pilot_initialization (
    id TINYINT NOT NULL PRIMARY KEY,
    completed_at DATETIME(3) NULL,
    CONSTRAINT ck_pilot_initialization_singleton CHECK (id=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO mp_pilot_initialization(id) VALUES(1);

CREATE TABLE mp_pilot_task_release (
    task_version_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    manifest_sha256 CHAR(64) NOT NULL,
    authority_code VARCHAR(40) NOT NULL DEFAULT 'OWNER_INVITATION_PILOT',
    authorized_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_pilot_task FOREIGN KEY (task_version_id) REFERENCES mp_task_version(id),
    CONSTRAINT ck_pilot_authority CHECK (authority_code='OWNER_INVITATION_PILOT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_pilot_account (
    student_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    account_slot TINYINT UNSIGNED NOT NULL UNIQUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_pilot_student FOREIGN KEY (student_id) REFERENCES mp_student_account(id),
    CONSTRAINT ck_pilot_slot CHECK (account_slot BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- No report FK: personal-report erasure must not restore a consumed allowance.
-- Only an opaque version identifier is retained here, never answers or model output.
CREATE TABLE mp_pilot_report_usage (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    report_version_public_id CHAR(26) NOT NULL UNIQUE,
    report_type VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'RESERVED',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    started_at DATETIME(3) NULL,
    completed_at DATETIME(3) NULL,
    CONSTRAINT fk_pilot_usage_student FOREIGN KEY (student_id) REFERENCES mp_pilot_account(student_id),
    CONSTRAINT ck_pilot_usage_type CHECK (report_type IN ('EXPERIENCE','COMPARISON')),
    CONSTRAINT ck_pilot_usage_status CHECK (status IN ('RESERVED','STARTED','SUCCEEDED','FAILED','RELEASED')),
    INDEX ix_pilot_usage_allowance (student_id,report_type,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
