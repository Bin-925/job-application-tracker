package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.MemberResponse;
import com.bin.jobtracker.repository.GoogleIdentityRepository;
import com.bin.jobtracker.service.*;
import com.bin.jobtracker.security.*;
import com.bin.jobtracker.exception.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.Clock;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@Slf4j
public class GoogleAccountController {
    private final GoogleProperties properties;
    private final GoogleAccountService google;
    private final GoogleSensitiveActions sensitive;
    private final GoogleIdentityRepository identities;
    private final GoogleLoginSecurity login;
    private final MemberService members;
    private final SessionService sessions;
    private final AuthRateLimiter limiter;
    private final Clock clock;

    public record Start(@NotNull GoogleFlowState.Mode mode, boolean rememberMe, @Size(max = 72) String currentPassword) {}
    public record Signup(@NotBlank @Pattern(regexp = "[a-z0-9]{4,20}") String username,
                         @NotBlank @Size(max = 10) String nickname) {}
    public record Password(@NotBlank @Size(min = 8, max = 30) @Pattern(regexp = "^(?=.*[a-zA-Z])(?=.*[0-9]).+$") String newPassword) {}
    public record CurrentPassword(@NotBlank @Size(max = 72) String currentPassword) {}
    public record Email(@NotBlank @Size(max = 254) @jakarta.validation.constraints.Email String email) {
        public Email { if (email != null) email = email.trim(); }
    }

    @GetMapping("/oauth/google/options")
    public Map<String, Boolean> options() { return Map.of("enabled", properties.enabled()); }

    @PostMapping("/oauth/google/start")
    public Map<String, String> start(@Valid @RequestBody Start body, @AuthenticationPrincipal SessionPrincipal principal, HttpServletRequest request) {
        properties.requireEnabled();
        if (body.mode() == GoogleFlowState.Mode.LOGIN && principal != null) throw new IllegalArgumentException("이미 로그인되어 있습니다.");
        if (body.mode() != GoogleFlowState.Mode.LOGIN) {
            if (principal == null) throw new ForbiddenException("로그인이 필요합니다.");
            limiter.checkPasswordAction(principal.memberId());
            if (body.mode() == GoogleFlowState.Mode.LINK) google.checkPassword(principal, body.currentPassword());
            else if (!identities.existsById(principal.memberId())) throw new ForbiddenException("연결된 Google 계정이 없습니다.");
        }
        var session = request.getSession(true);
        session.removeAttribute(GoogleFlowState.ENROLLMENT);
        session.removeAttribute(GoogleFlowState.PROOF);
        session.setAttribute(GoogleFlowState.FLOW, new GoogleFlowState.Flow(body.mode(), principal == null ? null : principal.memberId(),
                principal == null ? 0 : principal.authVersion(), body.rememberMe(), clock.millis() + 600000, ""));
        return Map.of("authorizationUrl", "/api/v1/oauth/authorize/google");
    }

    @GetMapping("/oauth/google/enrollment")
    public Map<String, Boolean> enrollment(HttpServletRequest request) {
        var session = request.getSession(false);
        return Map.of("pending", properties.enabled() && session != null
                && session.getAttribute(GoogleFlowState.ENROLLMENT) instanceof GoogleFlowState.Enrollment pending && pending.expiresAt() > clock.millis());
    }

    @PostMapping("/oauth/google/complete")
    public ResponseEntity<MemberResponse> complete(@Valid @RequestBody Signup body, @AuthenticationPrincipal SessionPrincipal principal,
                                                   HttpServletRequest request, HttpServletResponse response) {
        properties.requireEnabled();
        var session = request.getSession(false);
        if (principal != null || session == null || !(session.getAttribute(GoogleFlowState.ENROLLMENT) instanceof GoogleFlowState.Enrollment pending)
                || pending.expiresAt() <= clock.millis()) throw new ForbiddenException("Google 인증부터 다시 진행해 주세요.");
        com.bin.jobtracker.entity.Member member;
        try { member = google.register(pending.issuer(), pending.subject(), body.username(), body.nickname()); }
        catch (org.springframework.dao.DataIntegrityViolationException error) {
            if (error.getMostSpecificCause() instanceof java.sql.SQLException sql && "23505".equals(sql.getSQLState())) {
                if (members.existsByUsername(body.username())) throw new DuplicateUsernameException();
                throw new ForbiddenException("Google 인증부터 다시 진행해 주세요.");
            }
            throw error;
        }
        session.removeAttribute(GoogleFlowState.ENROLLMENT);
        login.install(member, pending.rememberMe(), request, response);
        return ResponseEntity.status(201).body(MemberResponse.from(member));
    }

    @GetMapping("/members/me/login-methods")
    public Map<String, Boolean> methods(@AuthenticationPrincipal SessionPrincipal principal, HttpServletRequest request) {
        return Map.of("googleEnabled", properties.enabled(), "googleLinked", identities.existsById(principal.memberId()),
                "hasPassword", members.findById(principal.memberId()).getPassword() != null,
                "googleVerified", google.proofAvailable(principal, proof(request)));
    }

    @DeleteMapping("/members/me/google")
    public ResponseEntity<Void> unlink(@AuthenticationPrincipal SessionPrincipal principal, @Valid @RequestBody CurrentPassword body,
                                       HttpServletRequest request, HttpServletResponse response) {
        limiter.checkPasswordAction(principal.memberId());
        google.unlink(principal, body.currentPassword());
        invalidate(principal, request, response);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/members/me/google/password")
    public ResponseEntity<Void> password(@AuthenticationPrincipal SessionPrincipal principal, @Valid @RequestBody Password body,
                                         HttpServletRequest request, HttpServletResponse response) {
        limiter.checkPasswordAction(principal.memberId());
        google.addPassword(principal, proof(request), body.newPassword());
        invalidate(principal, request, response);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/members/me/google/recovery-email")
    public ResponseEntity<Void> recoveryEmail(@AuthenticationPrincipal SessionPrincipal principal, @Valid @RequestBody Email body, HttpServletRequest request) {
        limiter.checkPasswordAction(principal.memberId());
        sensitive.recoveryEmail(principal, proof(request), body.email());
        request.getSession().removeAttribute(GoogleFlowState.PROOF);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/members/me/google/delete")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal SessionPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        limiter.checkPasswordAction(principal.memberId());
        sensitive.delete(principal, proof(request));
        invalidate(principal, request, response);
        return ResponseEntity.noContent().build();
    }

    private String proof(HttpServletRequest request) {
        var session = request.getSession(false);
        return session != null && session.getAttribute(GoogleFlowState.PROOF) instanceof String token ? token : null;
    }
    private void invalidate(SessionPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        try { sessions.deleteAll(principal.memberId()); }
        catch (RuntimeException error) { log.warn("Session cleanup deferred after Google account change"); }
        sessions.logout(request, response);
    }
}
