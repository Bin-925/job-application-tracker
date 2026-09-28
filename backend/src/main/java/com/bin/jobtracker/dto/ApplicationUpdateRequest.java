package com.bin.jobtracker.dto;

import com.bin.jobtracker.enums.ApplicationStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalTime;

public record ApplicationUpdateRequest(
        @NotBlank @jakarta.validation.constraints.Size(max = 100) String company,
        @NotBlank @jakarta.validation.constraints.Size(max = 100) String position,
        @NotNull ApplicationStatus status,
        @jakarta.validation.constraints.PastOrPresent LocalDate appliedDate,
        LocalDate deadline,
        LocalDate interviewDate,
        LocalTime interviewTime,
        @jakarta.validation.constraints.Size(max = 255) String link,
        @jakarta.validation.constraints.Size(max = 1000) String memo,
        @NotNull Long version
) {
    @jakarta.validation.constraints.AssertTrue(message = "지원일을 입력해 주세요.")
    public boolean isAppliedDateValid() {
        return status == null || status == ApplicationStatus.TO_APPLY || appliedDate != null;
    }
}
