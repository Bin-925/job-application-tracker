package com.bin.jobtracker.service;

import com.bin.jobtracker.security.SessionPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GoogleSensitiveActions {
    private final GoogleAccountService google;
    private final MemberService members;
    private final RecoveryEmailService recovery;
    @Transactional
    public void delete(SessionPrincipal principal, String proof) {
        google.consumeProof(principal, proof);
        members.deleteAfterReauthentication(principal.memberId(), principal.authVersion());
    }
    @Transactional
    public void recoveryEmail(SessionPrincipal principal, String proof, String email) {
        google.consumeProof(principal, proof);
        recovery.requestAfterReauthentication(principal.memberId(), principal.authVersion(), email);
    }
}
