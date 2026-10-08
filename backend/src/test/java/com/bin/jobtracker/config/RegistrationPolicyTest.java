package com.bin.jobtracker.config;

import com.bin.jobtracker.exception.MailUnavailableException;
import com.bin.jobtracker.service.RecoveryMailSender;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RegistrationPolicyTest {
    @Test void legacyModeDoesNotRequireMailAndRejectsVerificationFlow() {
        var mail = mock(RecoveryMailSender.class);
        var policy = new RegistrationPolicy(false, mail);
        assertThat(policy.required()).isFalse();
        assertThatThrownBy(policy::requireEnabled).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(mail);
    }
    @Test void requiredModeFailsFastWithoutMailRatherThanOpeningLegacySignup() {
        var mail = mock(RecoveryMailSender.class);
        doThrow(new MailUnavailableException()).when(mail).requireAvailable();
        assertThatThrownBy(() -> new RegistrationPolicy(true, mail)).isInstanceOf(MailUnavailableException.class);
    }
}
