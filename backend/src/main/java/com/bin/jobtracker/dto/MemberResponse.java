package com.bin.jobtracker.dto;

import com.bin.jobtracker.entity.Member;
import java.time.format.DateTimeFormatter;

public record MemberResponse(Long id, String username, String nickname, String avatar, String createdAt) {
    public static MemberResponse from(Member member) {
        String createdAt = member.getCreatedAt() != null
                ? member.getCreatedAt().format(DateTimeFormatter.ofPattern("yyyy년 MM월 dd일"))
                : "";
        return new MemberResponse(
                member.getId(),
                member.getUsername(),
                member.getNickname(),
                member.getAvatar(),
                createdAt
        );
    }
}