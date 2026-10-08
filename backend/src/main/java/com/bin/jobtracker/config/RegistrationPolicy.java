package com.bin.jobtracker.config;

import com.bin.jobtracker.service.RecoveryMailSender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class RegistrationPolicy {
    private final boolean required;
    public RegistrationPolicy(@Value("${app.registration-email.required:false}") boolean required, RecoveryMailSender mail) {
        this.required = required;
        if (required) mail.requireAvailable();
    }
    public boolean required() { return required; }
    public void requireEnabled() {
        if (!required) throw new IllegalArgumentException("현재 이메일 인증 가입을 사용할 수 없습니다.");
    }
}
