package com.bin.jobtracker.service;

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
    private final com.bin.jobtracker.repository.ApplicationRepository applicationRepository;

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
                .orElse(null);
        String hash = member == null
                ? "$2a$10$dXJ3SW6G7P50lGmMkkmwe.20YHtjWKe.WjnjDJjRlmqlVIVe6kj6a"
                : member.getPassword();
        if (!passwordEncoder.matches(password, hash) || member == null) {
            throw new org.springframework.security.authentication.BadCredentialsException("아이디 또는 비밀번호를 확인해 주세요.");
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
        Member member = memberRepository.findForUpdate(memberId).orElseThrow();
        member.updateNickname(nickname);
        return member;
    }

    @Transactional
    public void deleteMember(Long memberId, String currentPassword) {
        Member member = memberRepository.findForUpdate(memberId).orElseThrow();
        if (!passwordEncoder.matches(currentPassword, member.getPassword())) {
            throw new IllegalArgumentException("현재 비밀번호가 올바르지 않습니다.");
        }
        applicationRepository.deleteAll(applicationRepository.findByMemberId(memberId));
        applicationRepository.flush();
        memberRepository.delete(member);
    }

    @Transactional
    public Member updateAvatar(Long memberId, String avatar) {
        Member member = memberRepository.findForUpdate(memberId).orElseThrow();
        member.updateAvatar(avatar);
        return member;
    }

    @Transactional
    public void changePassword(Long memberId, String currentPassword, String newPassword) {
        Member member = memberRepository.findForUpdate(memberId).orElseThrow();
        // 현재 비밀번호 확인
        if (!passwordEncoder.matches(currentPassword, member.getPassword())) {
            throw new IllegalArgumentException("현재 비밀번호가 올바르지 않습니다.");
        }
        // 새 비밀번호가 기존과 같으면 막기
        if (passwordEncoder.matches(newPassword, member.getPassword())) {
            throw new IllegalArgumentException("새 비밀번호가 기존 비밀번호와 같습니다.");
        }
        member.updatePassword(passwordEncoder.encode(newPassword));
        member.revokeSessions();
    }

    @Transactional
    public void revokeSessions(Long memberId) {
        memberRepository.findForUpdate(memberId).orElseThrow().revokeSessions();
    }
}
