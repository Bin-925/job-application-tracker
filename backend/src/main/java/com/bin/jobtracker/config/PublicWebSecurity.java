package com.bin.jobtracker.config;

import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;

@Configuration
public class PublicWebSecurity {
    private static final Set<String> PAGES = Set.of("/", "/index.html", "/login", "/join",
            "/verify-registration", "/complete-google-signup", "/verify-email", "/forgot-password",
            "/reset-password", "/applications", "/applications/new", "/calendar", "/mypage",
            "/mypage/account", "/mypage/account/password", "/notifications");

    public static boolean isPublicPath(String path) {
        return PAGES.contains(path) || path.matches("/applications/[0-9]+(?:/edit)?")
                || path.startsWith("/assets/") || path.startsWith("/icons/") || path.startsWith("/.well-known/")
                || Set.of("/manifest.webmanifest", "/favicon.ico", "/sw.js", "/registerSW.js", "/livez", "/readyz").contains(path)
                || path.matches("/workbox-[A-Za-z0-9_-]+\\.js");
    }

    @Bean
    @Order(1)
    SecurityFilterChain publicWebChain(HttpSecurity http) throws Exception {
        // Static pages and probes never load a JDBC security context, even with an old cookie.
        return http.securityMatcher(request -> ("GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod()))
                        && isPublicPath(request.getRequestURI().substring(request.getContextPath().length())))
                .sessionManagement(config -> config.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(config -> config.securityContextRepository(new NullSecurityContextRepository()))
                .requestCache(config -> config.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                .headers(headers -> headers.cacheControl(config -> config.disable()).addHeaderWriter((request, response) -> {
                    boolean immutable = request.getRequestURI().matches(".*/assets/[^/]+-[A-Za-z0-9_-]{8,}\\.(?:js|css|woff2|png|svg)")
                            && response.getStatus() == 200;
                    response.setHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "private, no-store");
                }))
                .build();
    }
}
