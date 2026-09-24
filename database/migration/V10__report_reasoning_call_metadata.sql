-- Nullable metadata only: preserve historical call records and never store reasoning text.
ALTER TABLE mp_ai_call
 ADD COLUMN thinking_enabled BOOLEAN NULL,
 ADD COLUMN reasoning_tokens BIGINT UNSIGNED NULL,
 ADD CONSTRAINT ck_ai_thinking_enabled CHECK (thinking_enabled IS NULL OR thinking_enabled IN (0,1));
