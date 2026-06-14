package com.bin.jobtracker.entity;

import com.bin.jobtracker.enums.ApplicationSource;
import com.bin.jobtracker.enums.ApplicationStatus;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDate;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Application extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(nullable = false)
    private Member member;

    @Column(nullable = false)
    private String company;

    @Column(nullable = false)
    private String position;

    @Enumerated(EnumType.STRING)   // ⭐ enum을 숫자 아닌 문자로 저장
    @Column(nullable = false)
    private ApplicationStatus status;

    private LocalDate appliedDate;
    private LocalDate deadline;
    private String link;

    @Column(length = 1000)
    private String memo;

    @Enumerated(EnumType.STRING)
    private ApplicationSource source;

    private String externalJobId;   // 사람인 공고번호 (중복방지)
}