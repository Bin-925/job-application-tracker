package com.bin.jobtracker.entity;

import com.bin.jobtracker.enums.ApplicationSource;
import com.bin.jobtracker.enums.ApplicationStatus;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDate;
import java.time.LocalTime;

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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ApplicationStatus status;

    private LocalDate appliedDate;
    private LocalDate deadline;
    private LocalDate interviewDate;
    private LocalTime interviewTime;   // ← 추가
    private String link;

    @Column(length = 1000)
    private String memo;

    @Enumerated(EnumType.STRING)
    private ApplicationSource source;

    private String externalJobId;

    public Application(Member member, String company, String position, ApplicationStatus status,
                       LocalDate appliedDate, LocalDate deadline, LocalDate interviewDate,
                       LocalTime interviewTime, String link, String memo) {
        this.member = member;
        this.company = company;
        this.position = position;
        this.status = status;
        this.appliedDate = appliedDate;
        this.deadline = deadline;
        this.interviewDate = interviewDate;
        this.interviewTime = interviewTime;   // ← 추가
        this.link = link;
        this.memo = memo;
        this.source = ApplicationSource.MANUAL;
    }

    public void update(String company, String position, ApplicationStatus status,
                       LocalDate appliedDate, LocalDate deadline, LocalDate interviewDate,
                       LocalTime interviewTime, String link, String memo) {
        this.company = company;
        this.position = position;
        this.status = status;
        this.appliedDate = appliedDate;
        this.deadline = deadline;
        this.interviewDate = interviewDate;
        this.interviewTime = interviewTime;   // ← 추가
        this.link = link;
        this.memo = memo;
    }

    public void changeStatus(ApplicationStatus status) {
        this.status = status;
    }
}