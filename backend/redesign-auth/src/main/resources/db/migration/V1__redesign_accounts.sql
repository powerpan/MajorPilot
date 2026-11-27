CREATE TABLE demo_account (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    progress JSON,
    revision BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE demo_link (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    INDEX (expires_at)
);

CREATE TABLE demo_session (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    FOREIGN KEY (account_id) REFERENCES demo_account(id) ON DELETE CASCADE,
    INDEX (expires_at)
);

CREATE TABLE demo_mail_limit (
    bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    bucket_end BIGINT NOT NULL,
    hits INT NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket_key, bucket_end),
    INDEX (bucket_end)
);
