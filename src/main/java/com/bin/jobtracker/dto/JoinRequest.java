package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;

public record JoinRequest(
        @NotBlank String username,
        @NotBlank String password,
        @NotBlank String nickname
) {}