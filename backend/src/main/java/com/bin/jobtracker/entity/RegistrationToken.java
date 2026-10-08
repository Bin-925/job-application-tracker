package com.bin.jobtracker.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Entity
@Getter
@NoArgsConstructor
public class RegistrationToken {
    @Id @Column(length = 64) private String tokenHash;
    @Column(nullable = false, length = 254) private String email;
    @Column(nullable = false) private Instant expiresAt;
    public RegistrationToken(String tokenHash, String email, Instant now) {
        this.tokenHash = tokenHash;
        this.email = email;
        this.expiresAt = now.truncatedTo(ChronoUnit.SECONDS).plusSeconds(1800);
    }
}
