ALTER TABLE member ALTER COLUMN password DROP NOT NULL;
CREATE TABLE google_identity (
    member_id BIGINT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    issuer VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    UNIQUE (issuer, subject)
);
CREATE TABLE google_reauthentication (
    member_id BIGINT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    auth_version BIGINT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
