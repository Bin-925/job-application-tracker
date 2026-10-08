package com.bin.jobtracker.service;

import com.bin.jobtracker.entity.*;
import com.bin.jobtracker.repository.*;
import com.bin.jobtracker.security.SessionPrincipal;
import com.bin.jobtracker.exception.ForbiddenException;
import com.bin.jobtracker.exception.DuplicateUsernameException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import java.time.Clock;
import java.security.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
@RequiredArgsConstructor
public class GoogleAccountService {
    private final MemberRepository members;
    private final GoogleIdentityRepository identities;
    private final GoogleReauthenticationRepository proofs;
    private final BCryptPasswordEncoder passwords;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    @Transactional
    public Member login(String issuer, String subject) {
        Long id = identities.findMemberId(issuer, subject).orElse(null);
        if (id == null) return null;
        Member member = members.findForUpdate(id).orElseThrow(this::forbidden);
        var identity = identities.findById(id).orElseThrow(this::forbidden);
        if (!matches(identity, issuer, subject)) throw forbidden();
        return member;
    }

    @Transactional
    public Member register(String issuer, String subject, String username, String nickname) {
        if (identities.findMemberId(issuer, subject).isPresent()) throw forbidden();
        if (members.existsByUsername(username)) throw new DuplicateUsernameException();
        var member = members.saveAndFlush(new Member(username, null, nickname));
        identities.saveAndFlush(new GoogleIdentity(member.getId(), issuer, subject));
        return member;
    }

    @Transactional
    public void checkPassword(SessionPrincipal principal, String password) {
        var member = locked(principal);
        if (password == null || member.getPassword() == null || !passwords.matches(password, member.getPassword())) throw forbidden();
    }

    @Transactional
    public void link(SessionPrincipal principal, String issuer, String subject) {
        var member = locked(principal);
        if (identities.existsById(member.getId()) || identities.findMemberId(issuer, subject).isPresent()) throw forbidden();
        identities.saveAndFlush(new GoogleIdentity(member.getId(), issuer, subject));
        member.revokeSessions();
        proofs.deleteById(member.getId());
    }

    @Transactional
    public void unlink(SessionPrincipal principal, String password) {
        var member = locked(principal);
        if (member.getPassword() == null || password == null || !passwords.matches(password, member.getPassword())) throw forbidden();
        if (!identities.existsById(member.getId())) throw forbidden();
        identities.deleteById(member.getId());
        proofs.deleteById(member.getId());
        member.revokeSessions();
    }

    @Transactional
    public String reauthenticate(SessionPrincipal principal, String issuer, String subject) {
        var member = locked(principal);
        var identity = identities.findById(member.getId()).orElseThrow(this::forbidden);
        if (!matches(identity, issuer, subject)) throw forbidden();
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        proofs.save(new GoogleReauthentication(member.getId(), hash(token), member.getAuthVersion(), clock.instant()));
        return token;
    }

    public boolean proofAvailable(SessionPrincipal principal, String token) {
        if (token == null) return false;
        return proofs.findById(principal.memberId()).map(proof -> valid(proof, principal, token)).orElse(false);
    }

    @Transactional
    public Member consumeProof(SessionPrincipal principal, String token) {
        var member = locked(principal);
        var proof = proofs.findById(member.getId()).orElseThrow(this::forbidden);
        if (token == null || !valid(proof, principal, token)) throw forbidden();
        proofs.delete(proof);
        return member;
    }

    @Transactional
    public void addPassword(SessionPrincipal principal, String token, String password) {
        var member = consumeProof(principal, token);
        if (member.getPassword() != null) throw new IllegalArgumentException("이미 비밀번호가 설정되어 있습니다.");
        member.updatePassword(passwords.encode(password));
        member.revokeSessions();
    }

    private Member locked(SessionPrincipal principal) {
        var member = members.findForUpdate(principal.memberId()).orElseThrow(this::forbidden);
        if (member.getAuthVersion() != principal.authVersion()) throw forbidden();
        return member;
    }
    private boolean valid(GoogleReauthentication proof, SessionPrincipal principal, String token) {
        return proof.getAuthVersion() == principal.authVersion() && proof.getExpiresAt().isAfter(clock.instant())
                && MessageDigest.isEqual(proof.getTokenHash().getBytes(StandardCharsets.US_ASCII), hash(token).getBytes(StandardCharsets.US_ASCII));
    }
    private boolean matches(GoogleIdentity identity, String issuer, String subject) {
        return identity.getIssuer().equals(issuer) && identity.getSubject().equals(subject);
    }
    private ForbiddenException forbidden() { return new ForbiddenException("계정을 다시 확인해 주세요."); }
    private String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
