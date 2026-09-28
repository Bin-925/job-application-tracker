package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(max = 20) String username,
        @NotBlank @Size(max = 72) String password
) {}
