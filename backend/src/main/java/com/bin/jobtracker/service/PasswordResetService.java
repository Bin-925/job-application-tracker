package com.bin.jobtracker.service;

import com.bin.jobtracker.entity.PasswordResetToken;
import com.bin.jobtracker.repository.MemberRepository;
import com.bin.jobtracker.repository.PasswordResetRepository;
import com.bin.jobtracker.repository.RecoveryEmailRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
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
public class PasswordResetService {
    private final MemberRepository members;
    private final PasswordResetRepository tokens;
    private final RecoveryEmailRepository recoveryEmails;
    private final BCryptPasswordEncoder passwords;
    private final RecoveryMailSender mail;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    @Transactional
    public void issue(String username, String email) {
        Long id = members.findIdByUsername(username).orElse(null);
        if (id == null) return;
        var member = members.findForUpdate(id).orElse(null);
        if (member == null || !email.equals(member.getRecoveryEmail()) || member.getPassword() == null) return;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.save(new PasswordResetToken(id, email, hash(token), member.getAuthVersion(), clock.instant()));
        // SMTP failure rolls the transaction back, preserving the previous usable link.
        mail.passwordReset(email, token);
    }

    public record Result(Long memberId, String email) {}

    @Transactional
    public Result confirm(String token, String newPassword) {
        String hash = hash(token);
        Long id = tokens.findMemberIdByTokenHash(hash).orElseThrow(this::invalid);
        var member = members.findForUpdate(id).orElseThrow(this::invalid);
        // Read the token after the member lock; concurrent confirmations must see consumption.
        var stored = tokens.findById(id).orElseThrow(this::invalid);
        if (!stored.getTokenHash().equals(hash) || !stored.getExpiresAt().isAfter(clock.instant())
                || stored.getAuthVersion() != member.getAuthVersion()
                || !stored.getEmail().equals(member.getRecoveryEmail())) throw invalid();
        if (passwords.matches(newPassword, member.getPassword())) {
            throw new IllegalArgumentException("현재 비밀번호와 다른 비밀번호를 입력해 주세요.");
        }
        member.updatePassword(passwords.encode(newPassword));
        member.revokeSessions();
        tokens.delete(stored);
        recoveryEmails.deleteById(id);
        return new Result(id, stored.getEmail());
    }

    private IllegalArgumentException invalid() {
        return new IllegalArgumentException("유효하지 않거나 만료된 링크입니다. 재설정 메일을 다시 요청해 주세요.");
    }

    private String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
