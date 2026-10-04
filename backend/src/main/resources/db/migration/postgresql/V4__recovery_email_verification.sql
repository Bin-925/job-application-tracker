ALTER TABLE member ADD COLUMN recovery_email VARCHAR(254);

CREATE TABLE recovery_email_verification (
    member_id BIGINT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    auth_version BIGINT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL
);
