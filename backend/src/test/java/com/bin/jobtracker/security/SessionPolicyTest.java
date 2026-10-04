package com.bin.jobtracker.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.session.web.http.CookieSerializer.CookieValue;
import java.time.Clock;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class SessionPolicyTest {
    private final long start = Instant.parse("2026-10-04T00:00:00Z").toEpochMilli();
    private final AtomicLong now = new AtomicLong(start);
    private SessionPolicy policy;

    @BeforeEach void setUp() {
        Clock clock = mock(Clock.class);
        when(clock.millis()).thenAnswer(ignored -> now.get());
        policy = new SessionPolicy(clock);
    }

    @Test void defaultPolicyUsesShortIdleAndTwelveHourAbsoluteLimit() {
        var session = new MockHttpSession();
        policy.start(session, false);
        assertThat(session.getMaxInactiveInterval()).isEqualTo(1800);
        assertThat(policy.cookieMaxAge(session)).isEqualTo(-1);
        now.set(start + SessionPolicy.SHORT_ABSOLUTE.toMillis() - 1);
        assertThat(policy.isValid(session)).isTrue();
        now.incrementAndGet();
        assertThat(policy.isValid(session)).isFalse();
    }

    @Test void rememberedCookieOnlyHasRemainingAbsoluteLifetime() {
        var session = new MockHttpSession();
        policy.start(session, true);
        assertThat(session.getMaxInactiveInterval()).isEqualTo(604800);
        assertThat(policy.cookieMaxAge(session)).isEqualTo(604800);
        now.addAndGet(3 * 86400000L);
        assertThat(policy.cookieMaxAge(session)).isEqualTo(4 * 86400);
        assertThat(session.getAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT)).isEqualTo(start + 7 * 86400000L);
        now.set(start + 7 * 86400000L);
        assertThat(policy.isValid(session)).isFalse();
        assertThat(policy.cookieMaxAge(session)).isZero();
    }

    @Test void legacyMissingCorruptAndFuturePoliciesAreRejected() {
        var session = new MockHttpSession();
        assertThat(policy.isValid(null)).isFalse();
        assertThat(policy.isValid(session)).isFalse();
        policy.start(session, true);
        session.removeAttribute(SessionPolicy.REMEMBER_ME);
        assertThat(policy.isValid(session)).isFalse();
        policy.start(session, true);
        session.setAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT, "forever");
        assertThat(policy.isValid(session)).isFalse();
        policy.start(session, true);
        session.setAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT, start + 8 * 86400000L);
        assertThat(policy.isValid(session)).isFalse();
        policy.start(session, true);
        now.decrementAndGet();
        assertThat(policy.isValid(session)).isFalse();
    }

    @Test void serializerKeepsAnonymousShortAndRememberedPoliciesIndependent() {
        var serializer = serializer();
        var request = new MockHttpServletRequest();
        var session = new MockHttpSession();
        request.setSession(session);
        assertThat(write(serializer, request, "anonymous")).doesNotContain("Max-Age", "Expires=");
        policy.start(session, true);
        assertThat(write(serializer, request, "remembered")).contains("Max-Age=604800", "Secure", "HttpOnly", "SameSite=Lax", "Path=/");
        now.addAndGet(1000);
        assertThat(write(serializer, request, "rotated")).contains("Max-Age=604799");
        assertThat(write(serializer, new MockHttpServletRequest(), "anonymous2")).doesNotContain("Max-Age", "Expires=");
        policy.start(session, false);
        assertThat(write(serializer, request, "short")).doesNotContain("Max-Age", "Expires=");
    }

    @Test void deletionIsNeverReplacedByRememberedCookieAndExpiredCookieIsDeleted() {
        var request = new MockHttpServletRequest();
        var session = new MockHttpSession();
        request.setSession(session);
        policy.start(session, true);
        var serializer = serializer();
        assertThat(write(serializer, request, "")).contains("SESSION=;", "Max-Age=0");
        now.addAndGet(SessionPolicy.REMEMBERED.toMillis());
        assertThat(write(serializer, request, "expired")).contains("Max-Age=0");
    }

    private SessionCookieSerializer serializer() {
        var serializer = new SessionCookieSerializer(policy);
        serializer.setCookieName("SESSION");
        serializer.setCookiePath("/");
        serializer.setUseSecureCookie(true);
        serializer.setUseHttpOnlyCookie(true);
        serializer.setSameSite("Lax");
        return serializer;
    }

    private String write(SessionCookieSerializer serializer, MockHttpServletRequest request, String value) {
        var response = new MockHttpServletResponse();
        serializer.writeCookieValue(new CookieValue(request, response, value));
        return response.getHeader("Set-Cookie");
    }
}
