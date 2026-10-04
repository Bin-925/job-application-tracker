package com.bin.jobtracker.controller;

import com.bin.jobtracker.security.SessionPrincipal;
import com.bin.jobtracker.service.RecoveryEmailService;
import com.bin.jobtracker.service.SessionService;
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
@RequestMapping("/api/v1/members")
@RequiredArgsConstructor
@Slf4j
public class RecoveryEmailController {
    private final RecoveryEmailService service;
    private final SessionService sessions;

    public record Request(@NotBlank @Size(max = 254) @Email String email,
                          @NotBlank @Size(max = 72) String currentPassword) {
        public Request { if (email != null) email = email.trim(); }
    }
    public record Confirmation(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token) {}

    @GetMapping("/me/recovery-email")
    public RecoveryEmailService.Status status(@AuthenticationPrincipal SessionPrincipal principal) {
        return service.status(principal.memberId());
    }

    @PostMapping("/me/recovery-email/requests")
    public ResponseEntity<Void> request(@AuthenticationPrincipal SessionPrincipal principal, @Valid @RequestBody Request body) {
        service.request(principal.memberId(), principal.authVersion(), body.email(), body.currentPassword());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/recovery-email/confirm")
    public ResponseEntity<Void> confirm(@Valid @RequestBody Confirmation body,
            @AuthenticationPrincipal SessionPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        Long memberId = service.confirm(body.token());
        // The committed authVersion rejects old sessions even if physical cleanup fails.
        try { sessions.deleteAll(memberId); }
        catch (RuntimeException error) { log.warn("Session cleanup deferred after recovery email verification"); }
        if (principal != null && memberId.equals(principal.memberId())) sessions.logout(request, response);
        return ResponseEntity.noContent().build();
    }
}
