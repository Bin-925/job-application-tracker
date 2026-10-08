package com.bin.jobtracker.security;

import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.service.GoogleAccountService;
import com.bin.jobtracker.service.SessionService;
import jakarta.servlet.http.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.client.web.*;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import java.io.IOException;
import java.time.Clock;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class GoogleLoginSecurity {
    private final GoogleProperties properties;
    private final ObjectProvider<ClientRegistrationRepository> registrations;
    private final GoogleAccountService accounts;
    private final SessionService sessions;
    private final SessionPolicy policy;
    private final SessionAuthenticationStrategy strategy;
    private final SecurityContextRepository contexts;
    private final Clock clock;

    public void configure(HttpSecurity http) throws Exception {
        if (!properties.enabled()) return;
        http.addFilterBefore(new org.springframework.web.filter.OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, jakarta.servlet.FilterChain chain)
                    throws jakarta.servlet.ServletException, IOException {
                if (request.getRequestURI().equals(request.getContextPath() + "/api/v1/oauth/callback/google")) {
                    var session = request.getSession(false);
                    if (session != null && session.getAttribute(GoogleFlowState.FLOW) instanceof GoogleFlowState.Flow flow) {
                        var current = SecurityContextHolder.getContext().getAuthentication();
                        SessionPrincipal principal = current != null && current.getPrincipal() instanceof SessionPrincipal value ? value : null;
                        boolean bound = flow.mode() == GoogleFlowState.Mode.LOGIN ? principal == null
                                : principal != null && principal.memberId().equals(flow.memberId()) && principal.authVersion() == flow.authVersion();
                        if (!bound) { failure(request, response); return; }
                    }
                }
                chain.doFilter(request, response);
            }
        }, org.springframework.security.oauth2.client.web.OAuth2LoginAuthenticationFilter.class);
        var delegate = new DefaultOAuth2AuthorizationRequestResolver(registrations.getObject(), "/api/v1/oauth/authorize");
        delegate.setAuthorizationRequestCustomizer(builder -> {
            OAuth2AuthorizationRequestCustomizers.withPkce().accept(builder);
            builder.additionalParameters(parameters -> parameters.put("prompt", "select_account"));
        });
        OAuth2AuthorizationRequestResolver resolver = new OAuth2AuthorizationRequestResolver() {
            @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request) { return resolve(request, "google"); }
            @Override public OAuth2AuthorizationRequest resolve(HttpServletRequest request, String id) {
                if (!"GET".equals(request.getMethod()) || !request.getRequestURI().equals(request.getContextPath() + "/api/v1/oauth/authorize/google")) return null;
                var session = request.getSession(false);
                if (session == null || !(session.getAttribute(GoogleFlowState.FLOW) instanceof GoogleFlowState.Flow flow)
                        || flow.expiresAt() <= clock.millis() || !flow.state().isEmpty()) return null;
                var resolved = delegate.resolve(request, "google");
                if (resolved != null) session.setAttribute(GoogleFlowState.FLOW, flow.withState(resolved.getState()));
                return resolved;
            }
        };
        http.oauth2Login(oauth -> oauth.clientRegistrationRepository(registrations.getObject())
                .loginPage(properties.publicOrigin() + "/login")
                .authorizationEndpoint(endpoint -> endpoint.authorizationRequestResolver(resolver))
                .redirectionEndpoint(endpoint -> endpoint.baseUri("/api/v1/oauth/callback/*"))
                .authorizedClientRepository(new OAuth2AuthorizedClientRepository() {
                    @Override public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String id, Authentication auth, HttpServletRequest request) { return null; }
                    @Override public void saveAuthorizedClient(OAuth2AuthorizedClient client, Authentication auth, HttpServletRequest request, HttpServletResponse response) {}
                    @Override public void removeAuthorizedClient(String id, Authentication auth, HttpServletRequest request, HttpServletResponse response) {}
                })
                .successHandler(this::success)
                .failureHandler((request, response, error) -> failure(request, response)));
    }

    public void install(Member member, boolean rememberMe, HttpServletRequest request, HttpServletResponse response) {
        var authentication = authentication(new SessionPrincipal(member.getId(), member.getAuthVersion()));
        strategy.onAuthentication(authentication, request, response);
        policy.start(request.getSession(true), rememberMe);
        save(authentication, request, response);
    }

    private void success(HttpServletRequest request, HttpServletResponse response, Authentication authentication) throws IOException {
        try {
            var session = request.getSession(false);
            if (session == null || !(session.getAttribute(GoogleFlowState.FLOW) instanceof GoogleFlowState.Flow flow)
                    || flow.expiresAt() <= clock.millis() || !flow.state().equals(request.getParameter("state"))
                    || !(authentication.getPrincipal() instanceof OidcUser user)) throw new IllegalArgumentException();
            session.removeAttribute(GoogleFlowState.FLOW);
            String issuer = user.getIssuer().toString(), subject = user.getSubject();
            String expected = registrations.getObject().findByRegistrationId("google").getProviderDetails().getIssuerUri();
            if (!issuer.equals(expected) || subject == null || subject.isBlank() || subject.length() > 255) throw new IllegalArgumentException();
            if (flow.mode() == GoogleFlowState.Mode.LOGIN) {
                var member = accounts.login(issuer, subject);
                if (member != null) {
                    install(member, flow.rememberMe(), request, response);
                    response.sendRedirect(properties.publicOrigin() + "/");
                } else {
                    save(null, request, response);
                    session.setAttribute(GoogleFlowState.ENROLLMENT, new GoogleFlowState.Enrollment(issuer, subject, flow.rememberMe(), clock.millis() + 300000));
                    response.sendRedirect(properties.publicOrigin() + "/complete-google-signup");
                }
                return;
            }
            if (!policy.isValid(session) || flow.memberId() == null) throw new IllegalArgumentException();
            var principal = new SessionPrincipal(flow.memberId(), flow.authVersion());
            if (flow.mode() == GoogleFlowState.Mode.LINK) {
                accounts.link(principal, issuer, subject);
                try { sessions.deleteAll(principal.memberId()); }
                catch (RuntimeException error) { log.warn("Session cleanup deferred after Google linking"); }
                sessions.logout(request, response);
                response.sendRedirect(properties.publicOrigin() + "/login?googleLinked");
            } else {
                String proof = accounts.reauthenticate(principal, issuer, subject);
                save(authentication(principal), request, response);
                session.setAttribute(GoogleFlowState.PROOF, proof);
                response.sendRedirect(properties.publicOrigin() + "/mypage?googleVerified");
            }
        } catch (RuntimeException error) { failure(request, response); }
    }

    private Authentication authentication(SessionPrincipal principal) {
        return UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }
    private void save(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
    }
    private void failure(HttpServletRequest request, HttpServletResponse response) throws IOException {
        sessions.logout(request, response);
        response.sendRedirect(properties.publicOrigin() + "/login?googleError");
    }
}
