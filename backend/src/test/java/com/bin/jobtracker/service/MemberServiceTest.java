package com.bin.jobtracker.service;

import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.repository.MemberRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.*;
import static org.mockito.Mockito.never;

@ExtendWith(MockitoExtension.class)
class MemberServiceTest {

    @Mock MemberRepository memberRepository;
    @Mock BCryptPasswordEncoder passwordEncoder;  // ← 추가
    @InjectMocks MemberService memberService;

    @Test
    @DisplayName("회원가입 성공")
    void join_success() {
        given(memberRepository.existsByUsername("alice")).willReturn(false);
        given(passwordEncoder.encode(any())).willReturn("encoded_pw");
        given(memberRepository.save(any(Member.class))).willAnswer(inv -> inv.getArgument(0));

        Member result = memberService.join("alice", "password123", "앨리스");

        assertThat(result.getUsername()).isEqualTo("alice");
        then(memberRepository).should().save(any(Member.class));
    }

    @Test
    @DisplayName("회원가입 실패 - 이미 존재하는 username")
    void join_duplicate() {
        given(memberRepository.existsByUsername("alice")).willReturn(true);

        assertThatThrownBy(() -> memberService.join("alice", "password123", "앨리스"))
                .isInstanceOf(IllegalArgumentException.class);
        then(memberRepository).should(never()).save(any());
    }

    @Test
    @DisplayName("로그인 성공")
    void login_success() {
        Member member = new Member("alice", "encoded_pw", "앨리스");
        given(memberRepository.findByUsername("alice")).willReturn(Optional.of(member));
        given(passwordEncoder.matches("password123", "encoded_pw")).willReturn(true);

        Member result = memberService.login("alice", "password123");

        assertThat(result.getUsername()).isEqualTo("alice");
    }

    @Test
    @DisplayName("로그인 실패 - 비밀번호 불일치")
    void login_wrong_password() {
        Member member = new Member("alice", "encoded_pw", "앨리스");
        given(memberRepository.findByUsername("alice")).willReturn(Optional.of(member));
        given(passwordEncoder.matches("wrongpw", "encoded_pw")).willReturn(false);

        assertThatThrownBy(() -> memberService.login("alice", "wrongpw"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("로그인 실패 - 존재하지 않는 회원")
    void login_not_found() {
        given(memberRepository.findByUsername("nobody")).willReturn(Optional.empty());

        assertThatThrownBy(() -> memberService.login("nobody", "pw"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}