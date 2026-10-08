CREATE TABLE password_reset_token (
    member_id BIGINT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    email VARCHAR(254) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    auth_version BIGINT NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
