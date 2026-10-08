CREATE TABLE registration_token (
    token_hash VARCHAR(64) PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX registration_token_expiry_idx ON registration_token(expires_at);
