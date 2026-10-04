package com.bin.jobtracker.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;

@Entity
@Getter
@NoArgsConstructor
public class RecoveryEmailVerification {
    @Id private Long memberId;
    @Column(nullable = false, length = 254) private String email;
    @Column(nullable = false, unique = true, length = 64) private String tokenHash;
    @Column(nullable = false) private long authVersion;
    @Column(nullable = false) private Instant expiresAt;
    @Column(nullable = false) private Instant issuedAt;

    public RecoveryEmailVerification(Long memberId, String email, String hash, long version, Instant now) {
        this.memberId = memberId;
        this.email = email;
        this.tokenHash = hash;
        this.authVersion = version;
        this.issuedAt = now;
        this.expiresAt = now.plusSeconds(1800);
    }
}
