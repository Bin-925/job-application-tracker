package com.bin.jobtracker.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record JoinRequest(
        @NotBlank
        @Size(min = 4, max = 20, message = "아이디는 4~20자여야 합니다.")
        @Pattern(regexp = "^[a-z0-9]+$", message = "아이디는 영문 소문자와 숫자만 사용할 수 있습니다.")
        String username,

        @NotBlank
        @Size(min = 8, max = 30, message = "비밀번호는 8자 이상이어야 합니다.")
        @Pattern(regexp = "^(?=.*[a-zA-Z])(?=.*[0-9]).+$", message = "비밀번호는 영문과 숫자를 모두 포함해야 합니다.")
        String password,

        @NotBlank
        @Size(min = 1, max = 10, message = "닉네임은 1~10자여야 합니다.")
        String nickname
) {}