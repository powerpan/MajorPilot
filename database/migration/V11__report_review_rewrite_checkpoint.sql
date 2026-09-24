-- Private draft/rewrite checkpoints. Existing versions and executed migrations remain unchanged.
ALTER TABLE mp_report_version
 DROP CHECK mp_report_version_chk_2,
 ADD COLUMN review_required BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN review_policy_version VARCHAR(80) NULL,
 ADD COLUMN draft_proposal_json JSON NULL,
 ADD COLUMN draft_proposal_sha256 CHAR(64) NULL,
 ADD COLUMN review_invocation_id CHAR(26) NULL,
 ADD COLUMN review_input_sha256 CHAR(64) NULL,
 ADD COLUMN reviewed_proposal_sha256 CHAR(64) NULL,
 ADD COLUMN review_source_manifest_sha256 CHAR(64) NULL,
 ADD COLUMN review_catalog_sha256 CHAR(64) NULL,
 ADD CONSTRAINT ck_report_generation_phase CHECK(generation_phase IN
  ('WAITING_EVIDENCE','PREPARED','INITIAL_REQUESTED','REPAIR_REQUESTED','DRAFT_READY','REVIEW_REQUESTED','FALLBACK_PENDING','VALIDATED','PUBLISHED')),
 ADD CONSTRAINT ck_report_review_policy CHECK
  ((review_required=0 AND review_policy_version IS NULL) OR
   (review_required=1 AND review_policy_version IS NOT NULL AND review_policy_version='report-review-rewrite-v1'));
