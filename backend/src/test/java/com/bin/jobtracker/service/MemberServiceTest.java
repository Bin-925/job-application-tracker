package com.bin.jobtracker.service;

import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.repository.MemberRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.BDDMockito.*;

@ExtendWith(MockitoExtension.class)
class MemberServiceTest {

    @Mock MemberRepository memberRepository;
    @Mock PasswordEncoder passwordEncoder;
    @InjectMocks MemberService memberService;

    @Test
    @DisplayName("회원가입 성공 - 비밀번호는 암호화되어 저장된다")
    void join_success() {
        // given
        given(memberRepository.findByUsername("bin")).willReturn(Optional.empty());
        given(passwordEncoder.encode("1234")).willReturn("encoded1234");
        given(memberRepository.save(any(Member.class))).willAnswer(inv -> inv.getArgument(0));

        // when
        Member result = memberService.join("bin", "1234", "빈");

        // then
        assertThat(result.getUsername()).isEqualTo("bin");
        assertThat(result.getPassword()).isEqualTo("encoded1234");   // 평문 아님
    }

    @Test
    @DisplayName("회원가입 실패 - 이미 존재하는 username")
    void join_duplicate_username() {
        given(memberRepository.findByUsername("bin"))
                .willReturn(Optional.of(new Member("bin", "x", "빈")));

        assertThatThrownBy(() -> memberService.join("bin", "1234", "빈"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("이미 사용 중인");
    }

    @Test
    @DisplayName("로그인 성공")
    void login_success() {
        Member member = new Member("bin", "encoded1234", "빈");
        given(memberRepository.findByUsername("bin")).willReturn(Optional.of(member));
        given(passwordEncoder.matches("1234", "encoded1234")).willReturn(true);

        Member result = memberService.login("bin", "1234");

        assertThat(result.getUsername()).isEqualTo("bin");
    }

    @Test
    @DisplayName("로그인 실패 - 비밀번호 불일치")
    void login_wrong_password() {
        Member member = new Member("bin", "encoded1234", "빈");
        given(memberRepository.findByUsername("bin")).willReturn(Optional.of(member));
        given(passwordEncoder.matches("wrong", "encoded1234")).willReturn(false);

        assertThatThrownBy(() -> memberService.login("bin", "wrong"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("비밀번호");
    }

    @Test
    @DisplayName("로그인 실패 - 존재하지 않는 회원")
    void login_not_found() {
        given(memberRepository.findByUsername("ghost")).willReturn(Optional.empty());

        assertThatThrownBy(() -> memberService.login("ghost", "1234"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("존재하지 않는");
    }
}