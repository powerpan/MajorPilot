-- P7: explicit product operations, private exports, deletion receipts and retention.
-- V1-V7 remain immutable. No Operator is granted a role or permission by this migration.
ALTER TABLE mp_student_account
 ADD COLUMN analytics_exclusion_code VARCHAR(8) NULL,
 ADD CONSTRAINT ck_student_analytics_exclusion CHECK(analytics_exclusion_code IS NULL OR analytics_exclusion_code IN ('TEST','BOT')),
 ADD INDEX ix_student_cohort(status,analytics_exclusion_code,created_at,id);

ALTER TABLE mp_sensitive_audit
 ADD COLUMN owner_student_id BIGINT UNSIGNED NULL,
 ADD CONSTRAINT fk_sensitive_audit_student FOREIGN KEY(owner_student_id) REFERENCES mp_student_account(id),
 ADD INDEX ix_audit_student_time(owner_student_id,occurred_at,id),
 ADD INDEX ix_audit_retention(occurred_at,id),
 ADD INDEX ix_audit_target(target_type,target_public_id);

-- Resolve only known, exact target kinds. Unresolvable historic rows stay unowned.
UPDATE mp_sensitive_audit a JOIN mp_experience_run r
 ON a.target_type='EXPERIENCE_RUN' AND a.target_public_id=r.public_id
 SET a.owner_student_id=r.student_id WHERE a.owner_student_id IS NULL;
UPDATE mp_sensitive_audit a JOIN mp_report r
 ON a.target_type='REPORT' AND a.target_public_id=r.public_id
 SET a.owner_student_id=r.student_id WHERE a.owner_student_id IS NULL;
UPDATE mp_sensitive_audit a JOIN mp_report_version v
 ON a.target_type='REPORT_VERSION' AND a.target_public_id=v.public_id
 JOIN mp_report r ON r.id=v.report_id
 SET a.owner_student_id=r.student_id WHERE a.owner_student_id IS NULL;

CREATE TABLE mp_student_data_export (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NOT NULL,
 scope VARCHAR(32) NOT NULL,
 schema_version VARCHAR(80) NOT NULL DEFAULT 'personal-export-v1',
 status VARCHAR(16) NOT NULL DEFAULT 'REQUESTED',
 format VARCHAR(32) NOT NULL DEFAULT 'ZIP_JSON_HTML',
 object_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 file_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 file_size_bytes BIGINT UNSIGNED NULL,
 requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 completed_at DATETIME(3) NULL, expires_at DATETIME(3) NULL,
 failure_code VARCHAR(80) NULL, row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 CONSTRAINT fk_student_export_student FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 CONSTRAINT ck_student_export_scope CHECK(scope IN ('REPORTS_ONLY','FULL_PERSONAL_EXPORT')),
 CONSTRAINT ck_student_export_schema CHECK(schema_version='personal-export-v1'),
 CONSTRAINT ck_student_export_format CHECK(format='ZIP_JSON_HTML'),
 CONSTRAINT ck_student_export_status CHECK(status IN ('REQUESTED','PROCESSING','READY','FAILED','EXPIRED')),
 CONSTRAINT ck_student_export_ready CHECK(status<>'READY' OR
   (object_key IS NOT NULL AND file_sha256 IS NOT NULL AND file_size_bytes IS NOT NULL AND completed_at IS NOT NULL AND expires_at IS NOT NULL)),
 INDEX ix_student_export_owner(student_id,requested_at,id),
 INDEX ix_student_export_expiry(status,expires_at,id),
 INDEX ix_student_export_retention(status,completed_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_admin_export (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 -- RuoYi sys_user.user_id is SIGNED; this is not a Student identity.
 operator_id BIGINT NOT NULL,
 dataset VARCHAR(32) NOT NULL,
 schema_version VARCHAR(80) NOT NULL DEFAULT 'admin-csv-v1',
 filters_json JSON NOT NULL, fields_json JSON NOT NULL, purpose VARCHAR(500) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'REQUESTED', format VARCHAR(16) NOT NULL DEFAULT 'CSV',
 object_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
 file_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 file_size_bytes BIGINT UNSIGNED NULL, row_count BIGINT UNSIGNED NULL,
 requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 completed_at DATETIME(3) NULL, expires_at DATETIME(3) NULL,
 failure_code VARCHAR(80) NULL, row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 CONSTRAINT fk_admin_export_operator FOREIGN KEY(operator_id) REFERENCES sys_user(user_id),
 CONSTRAINT ck_admin_export_dataset CHECK(dataset IN ('STUDENTS','EXPERIENCE_RUNS','REPORTS','METRICS')),
 CONSTRAINT ck_admin_export_schema CHECK(schema_version='admin-csv-v1'),
 CONSTRAINT ck_admin_export_format CHECK(format='CSV'),
 CONSTRAINT ck_admin_export_status CHECK(status IN ('REQUESTED','PROCESSING','READY','FAILED','EXPIRED','REVOKED')),
 CONSTRAINT ck_admin_export_row_limit CHECK(row_count IS NULL OR row_count<=10000),
 CONSTRAINT ck_admin_export_ready CHECK(status<>'READY' OR
   (object_key IS NOT NULL AND file_sha256 IS NOT NULL AND file_size_bytes IS NOT NULL AND row_count IS NOT NULL AND completed_at IS NOT NULL AND expires_at IS NOT NULL)),
 INDEX ix_admin_export_owner(operator_id,requested_at,id),
 INDEX ix_admin_export_expiry(status,expires_at,id),
 INDEX ix_admin_export_retention(status,completed_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_admin_export_student (
 export_id BIGINT UNSIGNED NOT NULL, student_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(export_id,student_id),
 CONSTRAINT fk_export_member_export FOREIGN KEY(export_id) REFERENCES mp_admin_export(id),
 CONSTRAINT fk_export_member_student FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 INDEX ix_export_member_student(student_id,export_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_account_deletion_request (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 student_id BIGINT UNSIGNED NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'REQUESTED',
 requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 confirmed_at DATETIME(3) NULL, scheduled_for DATETIME(3) NULL, completed_at DATETIME(3) NULL,
 failure_code VARCHAR(80) NULL,
 receipt_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 receipt_secret_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 receipt_expires_at DATETIME(3) NOT NULL,
 current_stage VARCHAR(64) NOT NULL DEFAULT 'REQUESTED', last_attempt_at DATETIME(3) NULL,
 row_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
 -- CANCELLED releases the slot; FAILED retains it for resumable deletion.
 active_student_guard BIGINT UNSIGNED GENERATED ALWAYS AS
   (CASE WHEN status IN ('REQUESTED','CONFIRMED','PROCESSING','FAILED') THEN student_id ELSE NULL END) STORED,
 UNIQUE KEY uq_deletion_active_student(active_student_guard),
 CONSTRAINT fk_deletion_request_student FOREIGN KEY(student_id) REFERENCES mp_student_account(id),
 CONSTRAINT ck_deletion_request_status CHECK(status IN ('REQUESTED','CONFIRMED','PROCESSING','COMPLETED','FAILED','CANCELLED')),
 -- Completion and severing the last identity reference happen in one transaction.
 -- A cancelled receipt may also be detached when the account is later deleted.
 CONSTRAINT ck_deletion_request_owner CHECK(
   (status='COMPLETED' AND student_id IS NULL AND completed_at IS NOT NULL) OR status='CANCELLED' OR
   (status IN ('REQUESTED','CONFIRMED','PROCESSING','FAILED') AND student_id IS NOT NULL)),
 INDEX ix_deletion_student(student_id,requested_at,id),
 INDEX ix_deletion_due(status,scheduled_for,id),
 INDEX ix_deletion_overdue(status,confirmed_at,id),
 INDEX ix_deletion_unconfirmed(status,requested_at,id),
 INDEX ix_deletion_receipt_expiry(receipt_expires_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE mp_retention_status (
 policy_key VARCHAR(80) NOT NULL PRIMARY KEY,
 last_started_at DATETIME(3) NULL, last_completed_at DATETIME(3) NULL,
 last_error_code VARCHAR(80) NULL,
 deleted_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
 next_due_at DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE mp_background_job
 MODIFY COLUMN owner_student_id BIGINT UNSIGNED NULL,
 ADD COLUMN owner_operator_id BIGINT NULL,
 ADD CONSTRAINT fk_job_operator FOREIGN KEY(owner_operator_id) REFERENCES sys_user(user_id),
 ADD CONSTRAINT ck_job_type_owner CHECK(
   (job_type IN ('EVIDENCE_BUILD','EVIDENCE_REBUILD','REPORT_GENERATE','COMPARISON_GENERATE','STUDENT_EXPORT','ACCOUNT_DELETE')
     AND owner_student_id IS NOT NULL AND owner_operator_id IS NULL) OR
   (job_type='ADMIN_EXPORT' AND owner_student_id IS NULL AND owner_operator_id IS NOT NULL) OR
   (job_type='RETENTION_CLEANUP' AND owner_student_id IS NULL AND owner_operator_id IS NULL)),
 ADD INDEX ix_job_operator(owner_operator_id,status,id),
 ADD INDEX ix_job_typed_claim(job_type,status,available_at,lease_until,id),
 ADD INDEX ix_job_retention(status,completed_at,id);

-- Cohort anchors and observations use original facts, not current-profile timestamps.
ALTER TABLE mp_intake_session ADD INDEX ix_intake_cohort(created_at,id);
ALTER TABLE mp_experience_run
 ADD INDEX ix_run_student_anchor(student_id,run_mode,content_kind,started_at,id);
ALTER TABLE mp_report ADD INDEX ix_report_first_ready(student_id,report_type,first_ready_at,id);
ALTER TABLE mp_student_feedback ADD INDEX ix_feedback_first_survey(report_id,survey_version,first_valid_survey,created_at,id);
ALTER TABLE mp_product_event
 ADD INDEX ix_event_received(received_at,id),
 ADD INDEX ix_event_run_cooldown(student_id,experience_run_id,event_name,received_at,id),
 ADD INDEX ix_event_report_view(report_id,event_name,received_at,id);
ALTER TABLE mp_ai_call ADD INDEX ix_ai_retention(created_at,id);
ALTER TABLE mp_student_session ADD INDEX ix_session_retention(status,expires_at,id);
ALTER TABLE mp_email_token ADD INDEX ix_token_retention(expires_at,id);

-- Reserved IDs verified against the checked-in RuoYi baseline and V1-V7.
-- Explicit inserts deliberately fail on a collision instead of modifying existing menus.
-- No sys_role_menu rows and no P0/local security initialization marker are seeded.
INSERT INTO sys_menu
 (menu_id,menu_name,parent_id,order_num,path,component,route_name,is_frame,is_cache,menu_type,visible,status,perms,icon,create_by,create_time,remark)
 VALUES
 (7000,'MajorPilot',0,0,'majorpilot',NULL,'MajorPilot',1,1,'M','0','0','','guide','majorpilot',UTC_TIMESTAMP(),'MajorPilot 内部运营；按角色显式授予权限'),
 (7001,'运营概览',7000,1,'overview','majorpilot/overview/index','MajorPilotOverview',1,1,'C','0','0','majorpilot:overview:view','chart','majorpilot',UTC_TIMESTAMP(),'固定口径与覆盖说明'),
 (7002,'学生账户',7000,2,'students','majorpilot/students/index','MajorPilotStudents',1,1,'C','0','0','majorpilot:student:view','user','majorpilot',UTC_TIMESTAMP(),'默认脱敏列表'),
 (7003,'体验运行',7000,3,'experience-runs','majorpilot/experience-runs/index','MajorPilotExperienceRuns',1,1,'C','0','0','majorpilot:experience:view','list','majorpilot',UTC_TIMESTAMP(),'运行诊断与有审计的支持'),
 (7004,'报告管理',7000,4,'reports','majorpilot/reports/index','MajorPilotReports',1,1,'C','0','0','majorpilot:report:view','documentation','majorpilot',UTC_TIMESTAMP(),'普通权限不包含报告正文'),
 (7005,'任务版本',7000,5,'task-versions','majorpilot/task-versions/index','MajorPilotTaskVersions',1,1,'C','0','0','majorpilot:task:view','education','majorpilot',UTC_TIMESTAMP(),'内容审核与不可变发布版本'),
 (7006,'受控导出',7000,6,'exports','majorpilot/exports/index','MajorPilotExports',1,1,'C','0','0','majorpilot:export:create','download','majorpilot',UTC_TIMESTAMP(),'仅本人发起的私有导出'),
 (7007,'审计记录',7000,7,'audit-events','majorpilot/audit-events/index','MajorPilotAuditEvents',1,1,'C','0','0','majorpilot:audit:view','log','majorpilot',UTC_TIMESTAMP(),'安全元数据，不默认敏感正文'),
 (7010,'分析排除管理',7002,1,'',NULL,'',1,1,'F','0','0','majorpilot:analytics:manage','#','majorpilot',UTC_TIMESTAMP(),'显式 TEST/BOT 标记，必须填写原因'),
 (7011,'学生敏感读取',7002,2,'',NULL,'',1,1,'F','0','0','majorpilot:student:sensitive','#','majorpilot',UTC_TIMESTAMP(),'用途与审计必需'),
 (7012,'体验敏感读取',7003,1,'',NULL,'',1,1,'F','0','0','majorpilot:experience:sensitive','#','majorpilot',UTC_TIMESTAMP(),'用途与审计必需'),
 (7013,'创建恢复体验',7003,2,'',NULL,'',1,1,'F','0','0','majorpilot:recovery:create','#','majorpilot',UTC_TIMESTAMP(),'不改写原体验记录'),
 (7014,'报告重生成',7004,1,'',NULL,'',1,1,'F','0','0','majorpilot:report:regenerate','#','majorpilot',UTC_TIMESTAMP(),'原因、版本与审计必需'),
 (7015,'报告历史读取',7004,2,'',NULL,'',1,1,'F','0','0','majorpilot:report:history:view','#','majorpilot',UTC_TIMESTAMP(),'独立历史权限'),
 (7016,'报告敏感读取',7004,3,'',NULL,'',1,1,'F','0','0','majorpilot:report:sensitive:view','#','majorpilot',UTC_TIMESTAMP(),'正文读取必须先审计'),
 (7017,'任务发布管理',7005,1,'',NULL,'',1,1,'F','0','0','majorpilot:task:publish','#','majorpilot',UTC_TIMESTAMP(),'不绕过内容审核或真人试用门禁');
