package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NicknameUpdateRequest(
        @NotBlank
        @Size(min = 1, max = 10, message = "닉네임은 1~10자여야 합니다.")
        String nickname
) {}
