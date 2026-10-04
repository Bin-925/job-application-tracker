package com.bin.jobtracker.service;

import com.bin.jobtracker.exception.MailUnavailableException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import java.net.URI;

@Component
public class RecoveryMailSender {
    private final JavaMailSender sender;
    private final boolean enabled;
    private final String baseUrl;
    private final String from;
    private final java.util.concurrent.Semaphore sending = new java.util.concurrent.Semaphore(4);

    public RecoveryMailSender(ObjectProvider<JavaMailSender> sender,
            @Value("${app.recovery-email.enabled:false}") boolean enabled,
            @Value("${app.recovery-email.public-base-url:}") String baseUrl,
            @Value("${app.recovery-email.from:}") String from,
            @Value("${app.recovery-email.allow-local-http:false}") boolean allowLocalHttp) {
        this.sender = sender.getIfAvailable();
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.from = from;
        if (enabled) {
            URI uri = URI.create(baseUrl);
            boolean local = allowLocalHttp && "http".equals(uri.getScheme())
                    && java.util.Set.of("localhost", "127.0.0.1").contains(uri.getHost());
            if (this.sender == null || (!"https".equals(uri.getScheme()) && !local)
                    || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null
                    || uri.getFragment() != null || !uri.getPath().isEmpty()) {
                throw new IllegalArgumentException("Recovery email requires SMTP and a trusted origin without path/query/fragment.");
            }
            RecoveryEmailService.normalizeEmail(from);
        }
    }

    public boolean available() { return enabled && sender != null; }
    public void requireAvailable() { if (!available()) throw new MailUnavailableException(); }

    public void verification(String email, String token) {
        send(email, "취준노트 복구 이메일 인증", "본인이 요청한 경우에만 아래 링크에서 인증을 완료해 주세요.\n"
                + "링크는 30분 동안 한 번 사용할 수 있습니다. 인증 후 모든 기기에서 다시 로그인해야 합니다.\n"
                + baseUrl + "/verify-email#token=" + token
                + "\n요청하지 않았다면 이 메일을 무시하세요.");
    }

    public void changed(String oldEmail) {
        send(oldEmail, "취준노트 복구 이메일 변경 안내", "복구 이메일 변경 인증이 요청되었습니다.\n"
                + "본인이 진행하지 않았다면 취준노트에 로그인하여 비밀번호를 변경해 주세요.\n"
                + baseUrl + "/login");
    }

    private void send(String email, String subject, String body) {
        requireAvailable();
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject(subject);
        message.setText(body);
        if (!sending.tryAcquire()) throw new MailUnavailableException();
        try { sender.send(message); }
        catch (MailException error) { throw new MailUnavailableException(); }
        finally { sending.release(); }
    }
}
