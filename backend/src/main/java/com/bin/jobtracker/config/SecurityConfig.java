package com.bin.jobtracker.config;

import com.bin.jobtracker.repository.MemberRepository;
import com.bin.jobtracker.security.SessionPrincipal;
import com.bin.jobtracker.security.SessionValidityFilter;
import com.bin.jobtracker.security.SessionPolicy;
import com.bin.jobtracker.security.SessionCookieSerializer;
import com.bin.jobtracker.service.MemberService;
import com.bin.jobtracker.security.AuthRateLimiter;
import com.bin.jobtracker.security.AuthRateLimitProperties;
import com.bin.jobtracker.security.ApiRequestGuardFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.header.writers.StaticHeadersWriter;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.session.web.http.DefaultCookieSerializer;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;
import java.time.Clock;

@Configuration
@EnableConfigurationProperties(AuthRateLimitProperties.class)
public class SecurityConfig {
    @Bean
    Clock sessionClock() { return Clock.systemUTC(); }

    @Bean
    BCryptPasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    AuthenticationManager authenticationManager(MemberService members) {
        return request -> {
            var member = members.login(request.getName(), request.getCredentials().toString());
            return UsernamePasswordAuthenticationToken.authenticated(
                    new SessionPrincipal(member.getId(), member.getAuthVersion()), null,
                    List.of(new SimpleGrantedAuthority("ROLE_USER")));
        };
    }

    @Bean
    SecurityContextRepository securityContextRepository() { return new HttpSessionSecurityContextRepository(); }

    @Bean
    CsrfTokenRepository csrfTokenRepository() { return new HttpSessionCsrfTokenRepository(); }

    @Bean
    SessionAuthenticationStrategy sessionAuthenticationStrategy(CsrfTokenRepository csrf) {
        return new CompositeSessionAuthenticationStrategy(List.of(
                new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrf)));
    }

    @Bean
    DefaultCookieSerializer cookieSerializer(SessionPolicy policy, @Value("${app.session.secure:false}") boolean secure) {
        var cookie = new SessionCookieSerializer(policy);
        cookie.setCookieName("SESSION");
        cookie.setCookiePath("/");
        cookie.setUseHttpOnlyCookie(true);
        cookie.setUseSecureCookie(secure);
        cookie.setSameSite("Lax");
        return cookie;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, MemberRepository members,
            SecurityContextRepository contexts, CsrfTokenRepository csrf, AuthRateLimiter limiter,
            ObjectMapper json, SessionPolicy policy, @Value("${app.request.max-body-bytes:32768}") int maxBodyBytes) throws Exception {
        http.cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(config -> config.csrfTokenRepository(csrf))
                .securityContext(config -> config.securityContextRepository(contexts).requireExplicitSave(true))
                .sessionManagement(config -> config.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .requestCache(config -> config.disable())
                .formLogin(config -> config.disable())
                .httpBasic(config -> config.disable())
                .logout(config -> config.disable())
                .headers(headers -> headers.cacheControl(cache -> cache.disable())
                        .addHeaderWriter(new StaticHeadersWriter("Cache-Control", "private, no-store")))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/members/recovery-email/confirm").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/members/password-reset/options").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/members/password-reset/requests",
                                "/api/v1/members/password-reset/confirm").permitAll()
                        .requestMatchers("/api/v1/members/csrf", "/api/v1/members/join",
                                "/api/v1/members/login", "/api/v1/members/logout",
                                "/api/v1/members/check-username").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, error) -> {
                            response.setStatus(401);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"status\":401,\"message\":\"인증이 필요합니다.\"}");
                        })
                        .accessDeniedHandler((request, response, error) -> {
                            response.setStatus(403);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"status\":403,\"message\":\"요청을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.\"}");
                        }))
                .addFilterBefore(new ApiRequestGuardFilter(limiter, json, maxBodyBytes), CsrfFilter.class)
                .addFilterAfter(new SessionValidityFilter(members, policy), CsrfFilter.class);
        return http.build();
    }

    @Value("${app.cors.allowed-origins:http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173}")
    private List<String> allowedOrigins;

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "X-CSRF-TOKEN"));
        config.setExposedHeaders(List.of("Retry-After"));
        config.setAllowCredentials(true);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
