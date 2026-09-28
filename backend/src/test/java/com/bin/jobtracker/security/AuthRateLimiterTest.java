package com.bin.jobtracker.security;

import com.bin.jobtracker.exception.RateLimitException;
import io.github.bucket4j.TimeMeter;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.*;

class AuthRateLimiterTest {
    private final AtomicLong nanos = new AtomicLong();
    private final TimeMeter time = new TimeMeter() {
        @Override public long currentTimeNanos() { return nanos.get(); }
        @Override public boolean isWallClockBased() { return false; }
    };
    private AuthRateLimiter limiter(boolean enabled) {
        return new AuthRateLimiter(new AuthRateLimitProperties(enabled, 100, 1000, 3, 4, 2, 2, 60), time);
    }

    @Test void accountBudgetIsSharedAndRefillsWithoutSleeping() {
        var limiter = limiter(true);
        limiter.checkLogin("student");
        limiter.checkLogin("STUDENT");
        assertThatThrownBy(() -> limiter.checkLogin("student")).isInstanceOfSatisfying(RateLimitException.class,
                error -> assertThat(error.getRetryAfterSeconds()).isEqualTo(30));
        limiter.checkLogin("someoneelse");
        nanos.addAndGet(Duration.ofSeconds(30).toNanos());
        assertThatCode(() -> limiter.checkLogin("student")).doesNotThrowAnyException();
    }

    @Test void ipBudgetIsSharedAcrossSensitiveEndpointsButNotOtherIps() {
        var limiter = limiter(true);
        limiter.checkRequest("127.0.0.1", "/api/v1/members/login", "POST");
        limiter.checkRequest("127.0.0.1", "/api/v1/members/check-username", "GET");
        limiter.checkRequest("127.0.0.1", "/api/v1/members/me/password", "PATCH");
        assertThatThrownBy(() -> limiter.checkRequest("127.0.0.1", "/api/v1/members/login", "POST"))
                .isInstanceOf(RateLimitException.class);
        assertThatCode(() -> limiter.checkRequest("127.0.0.2", "/api/v1/members/login", "POST"))
                .doesNotThrowAnyException();
        assertThatCode(() -> limiter.checkRequest("127.0.0.1", "/api/v1/members/logout", "POST"))
                .doesNotThrowAnyException();
    }

    @Test void concurrentAttemptsCannotOverspendAccountBudget() throws Exception {
        var limiter = limiter(true);
        var accepted = new AtomicInteger();
        try (var executor = Executors.newFixedThreadPool(8)) {
            for (int i = 0; i < 40; i++) executor.submit(() -> {
                try { limiter.checkLogin("sameaccount"); accepted.incrementAndGet(); }
                catch (RateLimitException expected) { }
            });
        }
        assertThat(accepted.get()).isEqualTo(2);
    }

    @Test void signupHasItsOwnLongerBudget() {
        var limiter = limiter(true);
        limiter.checkRequest("ip", "/api/v1/members/join", "POST");
        limiter.checkRequest("ip", "/api/v1/members/join", "POST");
        assertThatThrownBy(() -> limiter.checkRequest("ip", "/api/v1/members/join", "POST"))
                .isInstanceOf(RateLimitException.class);
    }

    @Test void disabledTestConfigurationDoesNotThrottle() {
        var limiter = limiter(false);
        for (int i = 0; i < 20; i++) limiter.checkLogin("student");
    }
}
