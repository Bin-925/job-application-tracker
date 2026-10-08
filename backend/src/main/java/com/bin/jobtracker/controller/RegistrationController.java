package com.bin.jobtracker.controller;

import com.bin.jobtracker.config.RegistrationPolicy;
import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.exception.DuplicateUsernameException;
import com.bin.jobtracker.security.AuthRateLimiter;
import com.bin.jobtracker.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/members/registration")
@RequiredArgsConstructor
public class RegistrationController {
    private final RegistrationPolicy policy;
    private final RegistrationService service;
    private final MemberService members;
    private final AccountMailTasks tasks;
    private final AuthRateLimiter limiter;

    public record Options(boolean required) {}
    public record Request(@NotBlank @Size(max = 254) @Email String email) {
        public Request { if (email != null) email = email.trim(); }
    }
    public record Confirmation(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token,
                               @NotNull @Valid JoinRequest member) {}

    @GetMapping("/options")
    public Options options() { return new Options(policy.required()); }

    @PostMapping("/requests")
    public ResponseEntity<Void> request(@Valid @RequestBody Request body) {
        policy.requireEnabled();
        String email = RecoveryEmailService.normalizeEmail(body.email());
        limiter.checkRegistrationEmail(email);
        tasks.submit(() -> service.issue(email));
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/confirm")
    public ResponseEntity<Void> confirm(@Valid @RequestBody Confirmation body) {
        try { service.confirm(body.token(), body.member()); }
        catch (DataIntegrityViolationException error) {
            // Check only after rollback; a uniqueness race must not become a generic 500.
            if (error.getMostSpecificCause() instanceof java.sql.SQLException sql
                    && "23505".equals(sql.getSQLState()) && members.existsByUsername(body.member().username())) {
                throw new DuplicateUsernameException();
            }
            throw error;
        }
        return ResponseEntity.status(201).build();
    }
}
