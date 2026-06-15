package com.bin.jobtracker.service;

import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public Member join(String username, String password, String nickname) {
        memberRepository.findByUsername(username).ifPresent(m -> {
            throw new IllegalArgumentException("이미 사용 중인 username입니다: " + username);
        });
        Member member = new Member(username, passwordEncoder.encode(password), nickname);
        return memberRepository.save(member);
    }

    public Member login(String username, String password) {
        Member member = memberRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 회원입니다."));
        if (!passwordEncoder.matches(password, member.getPassword())) {
            throw new IllegalArgumentException("비밀번호가 일치하지 않습니다.");
        }
        return member;
    }
}