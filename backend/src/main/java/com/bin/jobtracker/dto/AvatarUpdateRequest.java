package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;

public record AvatarUpdateRequest(
        @NotBlank String avatar
) {}
