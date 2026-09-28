package com.bin.jobtracker.dto;

import com.bin.jobtracker.entity.ScheduleEvent;
import jakarta.validation.constraints.*;
import java.time.LocalDate;
import java.time.LocalTime;

public record ScheduleRequest(
        @NotNull ScheduleEvent.Type type,
        @NotBlank @Size(max = 80) String title,
        @NotNull LocalDate date,
        LocalTime time,
        @NotNull ScheduleEvent.State state,
        Long version
) {}
