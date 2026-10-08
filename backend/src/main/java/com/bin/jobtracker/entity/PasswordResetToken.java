package com.bin.jobtracker.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Getter
@NoArgsConstructor
public class PasswordResetToken {
    @Id private Long memberId;
    @Column(nullable = false, length = 254) private String email;
    @Column(nullable = false, unique = true, length = 64) private String tokenHash;
    @Column(nullable = false) private long authVersion;
    @Column(nullable = false) private Instant issuedAt;
    @Column(nullable = false) private Instant expiresAt;

    public PasswordResetToken(Long memberId, String email, String tokenHash, long authVersion, Instant now) {
        this.memberId = memberId;
        this.email = email;
        this.tokenHash = tokenHash;
        this.authVersion = authVersion;
        this.issuedAt = now.truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
        this.expiresAt = issuedAt.plusSeconds(900);
    }
}
