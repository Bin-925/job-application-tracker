package com.bin.jobtracker.service;

import com.bin.jobtracker.config.RegistrationPolicy;
import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.entity.RegistrationToken;
import com.bin.jobtracker.repository.RegistrationTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class RegistrationService {
    private final RegistrationPolicy policy;
    private final RegistrationTokenRepository tokens;
    private final MemberService members;
    private final RecoveryMailSender mail;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    @Transactional
    public void issue(String email) {
        policy.requireEnabled();
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.save(new RegistrationToken(hash(token), email, clock.instant()));
        mail.registration(email, token);
    }

    @Transactional
    public void confirm(String token, JoinRequest request) {
        policy.requireEnabled();
        var stored = tokens.findForUpdate(hash(token)).orElseThrow(this::invalid);
        if (!stored.getExpiresAt().isAfter(clock.instant())) throw invalid();
        // No username reservation or password storage exists before this transaction.
        var member = members.join(request.username(), request.password(), request.nickname());
        member.verifyRecoveryEmail(stored.getEmail());
        tokens.delete(stored);
    }

    @Scheduled(fixedDelay = 3600000, initialDelay = 60000)
    @Transactional
    public void cleanExpired() { tokens.deleteExpired(clock.instant()); }

    private IllegalArgumentException invalid() {
        return new IllegalArgumentException("유효하지 않거나 만료된 가입 링크입니다. 인증 메일을 다시 요청해 주세요.");
    }
    private String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
