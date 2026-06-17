package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PasswordUpdateRequest(
        @NotBlank String currentPassword,
        @NotBlank
        @Size(min = 8, max = 30, message = "비밀번호는 8~30자여야 합니다.")
        @Pattern(regexp = "^(?=.*[a-zA-Z])(?=.*[0-9]).+$", message = "비밀번호는 영문과 숫자를 포함해야 합니다.")
        String newPassword
) {}