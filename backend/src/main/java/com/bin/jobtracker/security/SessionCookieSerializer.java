package com.bin.jobtracker.security;

import org.springframework.session.web.http.DefaultCookieSerializer;

public class SessionCookieSerializer extends DefaultCookieSerializer {
    private final SessionPolicy policy;

    public SessionCookieSerializer(SessionPolicy policy) { this.policy = policy; }

    @Override
    public void writeCookieValue(CookieValue value) {
        // Keep cookie deletion intact; never mutate shared serializer settings per request.
        if (!value.getCookieValue().isEmpty() && value.getCookieMaxAge() != 0) {
            value.setCookieMaxAge(policy.cookieMaxAge(value.getRequest().getSession(false)));
        }
        super.writeCookieValue(value);
    }
}
