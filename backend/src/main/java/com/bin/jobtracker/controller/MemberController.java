package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.*;
import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.security.JwtProvider;
import com.bin.jobtracker.service.MemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/members")
@RequiredArgsConstructor
public class MemberController {
    private final MemberService memberService;
    private final JwtProvider jwtProvider;

    @PostMapping("/join")
    public ResponseEntity<String> join(@RequestBody @Valid JoinRequest req) {
        memberService.join(req.username(), req.password(), req.nickname());
        return ResponseEntity.status(HttpStatus.CREATED).body("회원가입 완료");
    }

    @GetMapping("/check-username")
    public ResponseEntity<Void> checkUsername(@RequestParam String username) {
        if (memberService.existsByUsername(username)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        return ResponseEntity.ok().build();
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody @Valid LoginRequest req) {
        Member member = memberService.login(req.username(), req.password());
        String token = jwtProvider.createToken(member.getId(), member.getUsername());
        return ResponseEntity.ok(new LoginResponse(member.getId(), member.getNickname(), token));
    }

    @GetMapping("/me")
    public ResponseEntity<MemberResponse> me(@AuthenticationPrincipal Long memberId) {
        Member member = memberService.findById(memberId);
        return ResponseEntity.ok(MemberResponse.from(member));
    }

    @PatchMapping("/me/nickname")
    public ResponseEntity<MemberResponse> updateNickname(
            @AuthenticationPrincipal Long memberId,
            @RequestBody @Valid NicknameUpdateRequest req) {
        Member member = memberService.updateNickname(memberId, req.nickname());
        return ResponseEntity.ok(MemberResponse.from(member));
    }

    @PatchMapping("/me/avatar")
    public ResponseEntity<MemberResponse> updateAvatar(
            @AuthenticationPrincipal Long memberId,
            @RequestBody @Valid AvatarUpdateRequest req) {
        Member member = memberService.updateAvatar(memberId, req.avatar());
        return ResponseEntity.ok(MemberResponse.from(member));
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteMember(@AuthenticationPrincipal Long memberId) {
        memberService.deleteMember(memberId);
        return ResponseEntity.noContent().build();
    }
}