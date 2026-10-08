package com.bin.jobtracker.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.net.URI;

@ConfigurationProperties(prefix = "app.google")
public record GoogleProperties(boolean enabled, String clientId, String clientSecret,
                               String publicOrigin, boolean allowLocalHttp) {
    public GoogleProperties {
        if (enabled) {
            if (clientId == null || clientId.isBlank() || clientSecret == null || clientSecret.isBlank() || publicOrigin == null)
                throw new IllegalArgumentException("Google login requires private client configuration");
            URI uri = URI.create(publicOrigin);
            boolean local = allowLocalHttp && "http".equals(uri.getScheme()) && java.util.Set.of("localhost", "127.0.0.1").contains(uri.getHost());
            if ((!"https".equals(uri.getScheme()) && !local) || uri.getHost() == null || uri.getUserInfo() != null
                    || !uri.getPath().isEmpty() || uri.getQuery() != null || uri.getFragment() != null)
                throw new IllegalArgumentException("Google login requires a trusted origin");
        }
    }
    public void requireEnabled() {
        if (!enabled) throw new IllegalArgumentException("Google 로그인을 사용할 수 없습니다.");
    }
    @Override public String toString() { return "GoogleProperties[enabled=" + enabled + "]"; }
}
