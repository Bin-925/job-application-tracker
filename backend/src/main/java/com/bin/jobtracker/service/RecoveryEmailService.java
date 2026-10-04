package com.bin.jobtracker.service;

import com.bin.jobtracker.entity.RecoveryEmailVerification;
import com.bin.jobtracker.exception.ForbiddenException;
import com.bin.jobtracker.exception.RateLimitException;
import com.bin.jobtracker.repository.MemberRepository;
import com.bin.jobtracker.repository.RecoveryEmailRepository;
import com.bin.jobtracker.security.AuthRateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class RecoveryEmailService {
    private final MemberRepository members;
    private final RecoveryEmailRepository verifications;
    private final BCryptPasswordEncoder passwords;
    private final RecoveryMailSender mail;
    private final AuthRateLimiter limiter;
    private final Clock clock;
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Status(boolean available, String verifiedEmail, String pendingEmail, Instant expiresAt) {}

    @Transactional(readOnly = true)
    public Status status(Long id) {
        var member = members.findById(id).orElseThrow();
        var pending = verifications.findById(id).filter(v -> v.getExpiresAt().isAfter(clock.instant())
                && v.getAuthVersion() == member.getAuthVersion()).orElse(null);
        return new Status(mail.available(), member.getRecoveryEmail(), pending == null ? null : pending.getEmail(),
                pending == null ? null : pending.getExpiresAt());
    }

    @Transactional
    public void request(Long id, long authVersion, String email, String password) {
        mail.requireAvailable();
        limiter.checkPasswordAction(id);
        var member = members.findForUpdate(id).orElseThrow();
        if (member.getAuthVersion() != authVersion || !passwords.matches(password, member.getPassword())) {
            throw new ForbiddenException("현재 비밀번호를 확인해 주세요.");
        }
        String normalized = normalizeEmail(email);
        if (normalized.equals(member.getRecoveryEmail())) throw new IllegalArgumentException("이미 인증된 이메일입니다.");
        Instant now = clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        var old = verifications.findById(id).orElse(null);
        if (old != null && old.getIssuedAt().plusSeconds(60).isAfter(now)) {
            throw new RateLimitException(Math.max(1, old.getIssuedAt().plusSeconds(60).getEpochSecond() - now.getEpochSecond()));
        }
        limiter.checkRecoveryEmail(id, normalized);
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        verifications.save(new RecoveryEmailVerification(id, normalized, hash(token), member.getAuthVersion(), now));
        // Bound SMTP timeouts keep this small, serialized account operation finite.
        // Failure rolls back the token replacement; a previously delivered link stays valid.
        mail.verification(normalized, token);
    }

    @Transactional
    public Long confirm(String token) {
        mail.requireAvailable();
        String hash = hash(token);
        var memberId = verifications.findMemberIdByTokenHash(hash).orElseThrow(RecoveryEmailService::invalidToken);
        var member = members.findForUpdate(memberId).orElseThrow(RecoveryEmailService::invalidToken);
        // Re-read after the member lock. Concurrent requests can replace/delete the token.
        var current = verifications.findById(member.getId()).orElseThrow(RecoveryEmailService::invalidToken);
        if (!current.getTokenHash().equals(hash) || !current.getExpiresAt().isAfter(clock.instant())
                || current.getAuthVersion() != member.getAuthVersion()) throw invalidToken();
        if (member.getRecoveryEmail() != null) mail.changed(member.getRecoveryEmail());
        member.verifyRecoveryEmail(current.getEmail());
        verifications.delete(current);
        return member.getId();
    }

    public static String normalizeEmail(String value) {
        String email = value.trim();
        int at = email.lastIndexOf('@');
        if (email.length() > 254 || at < 1 || at > 64 || !email.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+")
                || email.indexOf('@') != at) throw new IllegalArgumentException("이메일 주소를 확인해 주세요.");
        try { new jakarta.mail.internet.InternetAddress(email, true).validate(); }
        catch (jakarta.mail.internet.AddressException error) { throw new IllegalArgumentException("이메일 주소를 확인해 주세요."); }
        return email.substring(0, at) + email.substring(at).toLowerCase(Locale.ROOT);
    }

    private static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    private static IllegalArgumentException invalidToken() { return new IllegalArgumentException("인증 링크가 유효하지 않거나 만료되었습니다. 새 메일을 요청해 주세요."); }
}
