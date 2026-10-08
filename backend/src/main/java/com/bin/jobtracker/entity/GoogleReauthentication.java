package com.bin.jobtracker.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Getter
@NoArgsConstructor
public class GoogleReauthentication {
    @Id private Long memberId;
    @Column(nullable = false, unique = true, length = 64) private String tokenHash;
    @Column(nullable = false) private long authVersion;
    @Column(nullable = false) private Instant expiresAt;
    public GoogleReauthentication(Long memberId, String tokenHash, long authVersion, Instant now) {
        this.memberId = memberId; this.tokenHash = tokenHash; this.authVersion = authVersion;
        this.expiresAt = now.truncatedTo(java.time.temporal.ChronoUnit.SECONDS).plusSeconds(300);
    }
}
