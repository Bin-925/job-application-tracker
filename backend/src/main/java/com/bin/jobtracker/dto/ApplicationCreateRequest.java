package com.bin.jobtracker.dto;

import com.bin.jobtracker.enums.ApplicationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalTime;

public record ApplicationCreateRequest(
        @NotBlank String company,
        @NotBlank String position,
        @NotNull ApplicationStatus status,
        LocalDate appliedDate,
        LocalDate deadline,
        LocalDate interviewDate,
        LocalTime interviewTime,
        String link,
        String memo
) {}