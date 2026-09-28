package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AccountDeleteRequest(@NotBlank @Size(max = 72) String currentPassword) {}
