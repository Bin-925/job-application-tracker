package com.bin.jobtracker.entity;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member extends BaseEntity {
    @Column(unique = true, nullable = false)
    private String username;
    @Column(nullable = false)
    private String password;
    private String nickname;
    private String role;   // "USER"
    private String avatar; // 예: "blue", "green", "🐱" 등

    public Member(String username, String password, String nickname) {
        this.username = username;
        this.password = password;
        this.nickname = nickname;
        this.role = "USER";
        this.avatar = "blue"; // 기본값
    }

    public void updateNickname(String nickname) {
        this.nickname = nickname;
    }

    public void updateAvatar(String avatar) {
        this.avatar = avatar;
    }

    public void updatePassword(String password) {
        this.password = password;
    }
}