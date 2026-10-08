package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AvatarUpdateRequest(
        @NotBlank @Size(max = 32) String avatar
) {}
