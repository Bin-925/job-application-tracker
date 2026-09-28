package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;

public record AccountDeleteRequest(@NotBlank String currentPassword) {}
