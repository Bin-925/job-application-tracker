package com.bin.jobtracker.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Getter
@NoArgsConstructor
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"issuer", "subject"}))
public class GoogleIdentity {
    @Id private Long memberId;
    @Column(nullable = false, length = 255) private String issuer;
    @Column(nullable = false, length = 255) private String subject;
    public GoogleIdentity(Long memberId, String issuer, String subject) {
        this.memberId = memberId; this.issuer = issuer; this.subject = subject;
    }
}
