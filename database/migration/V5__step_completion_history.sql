-- Reopening a step must not erase its earlier submitted completion fact.
CREATE TABLE mp_step_completion (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 public_id CHAR(26) NOT NULL UNIQUE,
 step_state_id BIGINT UNSIGNED NOT NULL,
 response_revision BIGINT UNSIGNED NOT NULL,
 completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(step_state_id) REFERENCES mp_step_state(id),
 UNIQUE(step_state_id,response_revision)
) ENGINE=InnoDB;
INSERT INTO mp_step_completion(public_id,step_state_id,response_revision,completed_at)
 SELECT UPPER(SUBSTRING(SHA2(CONCAT('p2-completion:',id,':',current_revision),256),1,26)),id,current_revision,completed_at
 FROM mp_step_state WHERE status='COMPLETED';
