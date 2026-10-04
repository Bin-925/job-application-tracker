package com.bin.jobtracker.security;

import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.time.Duration;

@Component
public class SessionPolicy {
    public static final String AUTHENTICATED_AT = "jobtracker.authenticatedAt";
    public static final String ABSOLUTE_EXPIRES_AT = "jobtracker.absoluteExpiresAt";
    public static final String REMEMBER_ME = "jobtracker.rememberMe";
    public static final Duration SHORT_IDLE = Duration.ofMinutes(30);
    public static final Duration SHORT_ABSOLUTE = Duration.ofHours(12);
    public static final Duration REMEMBERED = Duration.ofDays(7);

    private final Clock clock;

    public SessionPolicy(Clock clock) { this.clock = clock; }

    public void start(HttpSession session, boolean rememberMe) {
        long now = clock.millis();
        session.setAttribute(AUTHENTICATED_AT, now);
        session.setAttribute(ABSOLUTE_EXPIRES_AT, now + lifetime(rememberMe).toMillis());
        session.setAttribute(REMEMBER_ME, rememberMe);
        session.setMaxInactiveInterval(Math.toIntExact((rememberMe ? REMEMBERED : SHORT_IDLE).toSeconds()));
    }

    public boolean isValid(HttpSession session) {
        if (session == null) return false;
        if (!(session.getAttribute(AUTHENTICATED_AT) instanceof Long started)
                || !(session.getAttribute(ABSOLUTE_EXPIRES_AT) instanceof Long expires)
                || !(session.getAttribute(REMEMBER_ME) instanceof Boolean remembered)) return false;
        long now = clock.millis();
        return started > 0 && started <= now && expires > now
                && expires - started == lifetime(remembered).toMillis();
    }

    public int cookieMaxAge(HttpSession session) {
        if (session == null || !Boolean.TRUE.equals(session.getAttribute(REMEMBER_ME))) return -1;
        if (!isValid(session)) return 0;
        long remaining = (Long) session.getAttribute(ABSOLUTE_EXPIRES_AT) - clock.millis();
        return Math.toIntExact(Math.max(0, remaining / 1000));
    }

    private Duration lifetime(boolean remembered) { return remembered ? REMEMBERED : SHORT_ABSOLUTE; }
}
