package com.bin.jobtracker.controller;

import com.bin.jobtracker.security.AuthRateLimiter;
import com.bin.jobtracker.security.SessionPrincipal;
import com.bin.jobtracker.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/members/password-reset")
@RequiredArgsConstructor
@Slf4j
public class PasswordResetController {
    private final PasswordResetService service;
    private final RecoveryMailSender mail;
    private final AccountMailTasks tasks;
    private final AuthRateLimiter limiter;
    private final SessionService sessions;

    public record Options(boolean available) {}
    public record Request(@NotBlank @Size(max = 20) String username,
                          @NotBlank @Size(max = 254) @Email String email) {
        public Request { if (email != null) email = email.trim(); }
    }
    public record Confirmation(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token,
            @NotBlank @Size(min = 8, max = 30) @Pattern(regexp = "^(?=.*[a-zA-Z])(?=.*[0-9]).+$") String newPassword) {}

    @GetMapping("/options")
    public Options options() { return new Options(mail.available()); }

    @PostMapping("/requests")
    public ResponseEntity<Void> request(@Valid @RequestBody Request body) {
        String email = RecoveryEmailService.normalizeEmail(body.email());
        mail.requireAvailable();
        limiter.checkPasswordReset(body.username(), email);
        tasks.submit(() -> service.issue(body.username(), email));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/confirm")
    public ResponseEntity<Void> confirm(@Valid @RequestBody Confirmation body,
            @AuthenticationPrincipal SessionPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        var result = service.confirm(body.token(), body.newPassword());
        try { sessions.deleteAll(result.memberId()); }
        catch (RuntimeException error) { log.warn("Session cleanup deferred after password reset"); }
        if (principal != null && result.memberId().equals(principal.memberId())) sessions.logout(request, response);
        // Password change is already committed; notification failure must not report a failed reset.
        try { tasks.submit(() -> mail.passwordChanged(result.email())); }
        catch (RuntimeException error) { log.warn("Password reset notification unavailable"); }
        return ResponseEntity.noContent().build();
    }
}
