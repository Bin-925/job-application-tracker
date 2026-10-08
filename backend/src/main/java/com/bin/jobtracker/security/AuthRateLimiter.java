package com.bin.jobtracker.security;

import com.bin.jobtracker.exception.RateLimitException;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.TimeMeter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;

@Component
public class AuthRateLimiter {
    private final AuthRateLimitProperties properties;
    private final Cache<String, Bucket> buckets;
    private final Bucket global;
    private final TimeMeter time;

    @Autowired
    public AuthRateLimiter(AuthRateLimitProperties properties) {
        this(properties, TimeMeter.SYSTEM_NANOTIME);
    }

    AuthRateLimiter(AuthRateLimitProperties properties, TimeMeter time) {
        this.properties = properties;
        this.time = time;
        buckets = Caffeine.newBuilder().maximumSize(properties.maxEntries())
                .expireAfterAccess(Duration.ofHours(1)).build();
        global = bucket(properties.globalRequestsPerMinute(), Duration.ofMinutes(1));
    }

    public void checkRequest(String ip, String path, String method) {
        if (!properties.enabled() || method.equals("OPTIONS")) return;
        if (!path.startsWith("/api/v1/members/")) return;
        boolean csrf = path.equals("/api/v1/members/csrf");
        boolean protectedRequest = csrf || path.equals("/api/v1/members/check-username")
                || path.equals("/api/v1/members/login") || path.equals("/api/v1/members/join")
                || path.equals("/api/v1/members/me/password")
                || path.equals("/api/v1/members/me/recovery-email/requests")
                || path.equals("/api/v1/members/recovery-email/confirm")
                || path.startsWith("/api/v1/members/password-reset/")
                || (path.equals("/api/v1/members/me") && method.equals("DELETE"));
        if (!protectedRequest) return;
        consume(global);
        check(csrf ? "csrf-ip" : "auth-ip", ip,
                csrf ? properties.csrfRequestsPerIpPerMinute() : properties.requestsPerIpPerMinute(),
                Duration.ofMinutes(1));
        if (path.equals("/api/v1/members/join")) {
            check("join-ip", ip, properties.registrationsPerIp(), Duration.ofSeconds(properties.accountWindowSeconds()));
        }
    }

    public void checkLogin(String username) {
        if (!properties.enabled()) return;
        check("login-account", username.toLowerCase(Locale.ROOT), properties.attemptsPerAccount(),
                Duration.ofSeconds(properties.accountWindowSeconds()));
    }

    public void checkPasswordAction(Long memberId) {
        if (!properties.enabled()) return;
        check("password-account", memberId.toString(), properties.attemptsPerAccount(),
                Duration.ofSeconds(properties.accountWindowSeconds()));
    }

    public void checkRecoveryEmail(Long memberId, String email) {
        if (!properties.enabled()) return;
        check("recovery-member", memberId.toString(), 3, Duration.ofHours(1));
        check("recovery-recipient", email.toLowerCase(Locale.ROOT), 3, Duration.ofHours(1));
    }

    private void check(String scope, String identity, int capacity, Duration period) {
        String key = scope + ":" + digest(identity);
        consume(buckets.get(key, ignored -> bucket(capacity, period)));
    }

    public void checkPasswordReset(String username, String email) {
        if (!properties.enabled()) return;
        check("reset-account-minute", username.toLowerCase(Locale.ROOT), 1, Duration.ofMinutes(1));
        check("reset-account", username.toLowerCase(Locale.ROOT), 3, Duration.ofHours(1));
        check("reset-recipient", email.toLowerCase(Locale.ROOT), 3, Duration.ofHours(1));
    }

    private Bucket bucket(int capacity, Duration period) {
        return Bucket.builder().withCustomTimePrecision(time)
                .addLimit(limit -> limit.capacity(capacity).refillGreedy(capacity, period)).build();
    }

    private void consume(Bucket bucket) {
        var probe = bucket.tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            long seconds = Math.max(1, Math.ceilDiv(probe.getNanosToWaitForRefill(), 1_000_000_000L));
            throw new RateLimitException(seconds);
        }
    }

    private String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }
}
