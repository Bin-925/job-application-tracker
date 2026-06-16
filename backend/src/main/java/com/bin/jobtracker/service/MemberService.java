package com.bin.jobtracker.service;

import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MemberService {

    private final MemberRepository memberRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    @Transactional
    public Member join(String username, String password, String nickname) {
        if (memberRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("이미 사용 중인 username입니다: " + username);
        }
        Member member = new Member(username, passwordEncoder.encode(password), nickname);
        return memberRepository.save(member);
    }

    public Member login(String username, String password) {
        Member member = memberRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 아이디입니다."));
        if (!passwordEncoder.matches(password, member.getPassword())) {
            throw new IllegalArgumentException("비밀번호가 올바르지 않습니다.");
        }
        return member;
    }

    public boolean existsByUsername(String username) {
        return memberRepository.existsByUsername(username);
    }

    public Member findById(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다."));
    }

    @Transactional
    public Member updateNickname(Long memberId, String nickname) {
        Member member = findById(memberId);
        member.updateNickname(nickname);
        return member;
    }

    @Transactional
    public void deleteMember(Long memberId) {
        Member member = findById(memberId);
        memberRepository.delete(member);
    }

    @Transactional
    public Member updateAvatar(Long memberId, String avatar) {
        Member member = findById(memberId);
        member.updateAvatar(avatar);
        return member;
    }
}