-- P0-only synthetic actors, not the P1 student schema. UTC DATETIME values.
CREATE TABLE mp_p0_actor (
  id CHAR(36) PRIMARY KEY,
  state VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE mp_p0_intake (
  id CHAR(36) PRIMARY KEY,
  secret_hash CHAR(64) NOT NULL UNIQUE,
  actor_id CHAR(36) NULL,
  expires_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE mp_p0_session (
  secret_hash CHAR(64) PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX ix_mp_p0_session_actor(actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE mp_p0_receipt (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NULL,
  secret_hash CHAR(64) NOT NULL,
  state VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  expires_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE mp_p0_example (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NOT NULL,
  label VARCHAR(80) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE mp_background_job (
  id CHAR(36) PRIMARY KEY,
  job_type VARCHAR(32) NOT NULL,
  business_key VARCHAR(160) NOT NULL UNIQUE,
  owner_student_id CHAR(36) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  attempt_count INT NOT NULL DEFAULT 0,
  available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  lease_until DATETIME(6) NULL,
  lease_version BIGINT NOT NULL DEFAULT 0,
  worker_id VARCHAR(80) NULL,
  checkpoint_json JSON NULL,
  last_error_code VARCHAR(80) NULL,
  started_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  INDEX ix_mp_job_poll(status,available_at,lease_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE mp_p0_job_result (
  job_id CHAR(36) PRIMARY KEY,
  lease_version BIGINT NOT NULL,
  published_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
