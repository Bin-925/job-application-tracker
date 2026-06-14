package com.bin.jobtracker.dto;

import com.bin.jobtracker.enums.ApplicationStatus;
import jakarta.validation.constraints.NotNull;

public record StatusUpdateRequest(@NotNull ApplicationStatus status) {}