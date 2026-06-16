package com.bin.jobtracker.dto;

import com.bin.jobtracker.entity.Application;
import com.bin.jobtracker.enums.ApplicationSource;
import com.bin.jobtracker.enums.ApplicationStatus;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record ApplicationResponse(
        Long id,
        String company,
        String position,
        ApplicationStatus status,
        LocalDate appliedDate,
        LocalDate deadline,
        LocalDate interviewDate,
        LocalTime interviewTime,
        String link,
        String memo,
        ApplicationSource source,
        LocalDateTime createdAt
) {
    public static ApplicationResponse from(Application a) {
        return new ApplicationResponse(
                a.getId(), a.getCompany(), a.getPosition(), a.getStatus(),
                a.getAppliedDate(), a.getDeadline(), a.getInterviewDate(), a.getInterviewTime(),
                a.getLink(), a.getMemo(), a.getSource(), a.getCreatedAt());
    }
}