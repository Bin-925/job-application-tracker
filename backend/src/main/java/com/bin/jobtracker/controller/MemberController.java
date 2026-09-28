package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.*;
import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.security.SessionPrincipal;
import com.bin.jobtracker.service.MemberService;
import com.bin.jobtracker.service.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/members")
@RequiredArgsConstructor
public class MemberController {
    private final MemberService memberService;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contexts;
    private final SessionAuthenticationStrategy sessionStrategy;
    private final SessionService sessions;

    @GetMapping("/csrf")
    public java.util.Map<String, String> csrf(CsrfToken token) {
        return java.util.Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }

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
    public ResponseEntity<MemberResponse> login(@RequestBody @Valid LoginRequest req,
            HttpServletRequest request, HttpServletResponse response) {
        var authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(req.username(), req.password()));
        sessionStrategy.onAuthentication(authentication, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        var principal = (SessionPrincipal) authentication.getPrincipal();
        return ResponseEntity.ok(MemberResponse.from(memberService.findById(principal.memberId())));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        sessions.logout(request, response);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutAll(@AuthenticationPrincipal(expression = "memberId") Long memberId,
            HttpServletRequest request, HttpServletResponse response) {
        memberService.revokeSessions(memberId);
        sessions.deleteAll(memberId);
        sessions.logout(request, response);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<MemberResponse> me(@AuthenticationPrincipal(expression = "memberId") Long memberId) {
        Member member = memberService.findById(memberId);
        return ResponseEntity.ok(MemberResponse.from(member));
    }

    @PatchMapping("/me/nickname")
    public ResponseEntity<MemberResponse> updateNickname(
            @AuthenticationPrincipal(expression = "memberId") Long memberId,
            @RequestBody @Valid NicknameUpdateRequest req) {
        Member member = memberService.updateNickname(memberId, req.nickname());
        return ResponseEntity.ok(MemberResponse.from(member));
    }

    @PatchMapping("/me/avatar")
    public ResponseEntity<MemberResponse> updateAvatar(
            @AuthenticationPrincipal(expression = "memberId") Long memberId,
            @RequestBody @Valid AvatarUpdateRequest req) {
        Member member = memberService.updateAvatar(memberId, req.avatar());
        return ResponseEntity.ok(MemberResponse.from(member));
    }

    @PatchMapping("/me/password")
    public ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal(expression = "memberId") Long memberId,
            @RequestBody @Valid PasswordUpdateRequest req,
            HttpServletRequest request, HttpServletResponse response) {
        memberService.changePassword(memberId, req.currentPassword(), req.newPassword());
        sessions.deleteAll(memberId);
        sessions.logout(request, response);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/me")
    public ResponseEntity<Void> deleteMember(@AuthenticationPrincipal(expression = "memberId") Long memberId,
            @RequestBody @Valid AccountDeleteRequest req,
            HttpServletRequest request, HttpServletResponse response) {
        memberService.deleteMember(memberId, req.currentPassword());
        sessions.deleteAll(memberId);
        sessions.logout(request, response);
        return ResponseEntity.noContent().build();
    }
}
