package com.bin.jobtracker.dto;

import com.bin.jobtracker.entity.Application;
import com.bin.jobtracker.enums.ApplicationSource;
import com.bin.jobtracker.enums.ApplicationStatus;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record ApplicationResponse(
        Long id,
        String company,
        String position,
        ApplicationStatus status,
        LocalDate appliedDate,
        LocalDate deadline,
        String link,
        String memo,
        ApplicationSource source,
        LocalDateTime createdAt
) {
    // 엔티티 → 응답 변환
    public static ApplicationResponse from(Application a) {
        return new ApplicationResponse(
                a.getId(), a.getCompany(), a.getPosition(), a.getStatus(),
                a.getAppliedDate(), a.getDeadline(), a.getLink(), a.getMemo(),
                a.getSource(), a.getCreatedAt());
    }
}
