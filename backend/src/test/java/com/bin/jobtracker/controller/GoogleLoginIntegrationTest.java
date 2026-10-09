package com.bin.jobtracker.controller;

import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.repository.*;
import com.bin.jobtracker.service.*;
import com.bin.jobtracker.security.SessionPrincipal;
import tools.jackson.databind.ObjectMapper;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"app.google.enabled=true", "app.google.client-id=fixture-client", "app.google.client-secret=fixture-secret",
        "app.google.public-origin=https://jobtracker.test"})
@AutoConfigureMockMvc
@Import(GoogleLoginIntegrationTest.ProviderConfig.class)
class GoogleLoginIntegrationTest {
    static final ObjectMapper mapper = new ObjectMapper();
    static final HttpServer provider;
    static final String issuer;
    static final com.nimbusds.jose.jwk.RSAKey key;
    static final Map<String, Grant> grants = new ConcurrentHashMap<>();
    static final AtomicInteger exchanges = new AtomicInteger();
    record Grant(String subject, String nonce, String challenge, String invalid) {}
    static {
        try {
            key = new RSAKeyGenerator(2048).keyID("fixture").generate();
            provider = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            issuer = "http://127.0.0.1:" + provider.getAddress().getPort();
            provider.createContext("/jwks", exchange -> {
                byte[] bytes = ("{\"keys\":[" + key.toPublicJWK().toJSONString() + "]}").getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
            });
            provider.createContext("/token", exchange -> {
                int status = 200; String body;
                try {
                    exchanges.incrementAndGet();
                    var parameters = parameters(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
                    Grant grant = grants.remove(parameters.get("code"));
                    if (grant == null) throw new IllegalArgumentException();
                    String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256")
                            .digest(parameters.get("code_verifier").getBytes(StandardCharsets.US_ASCII)));
                    if (!challenge.equals(grant.challenge())) throw new IllegalArgumentException();
                    Instant now = Instant.now();
                    var claims = new JWTClaimsSet.Builder().issuer(grant.invalid().equals("issuer") ? "https://wrong.test" : issuer)
                            .subject(grant.subject()).audience(grant.invalid().equals("audience") ? "wrong-client" : "fixture-client")
                            .issueTime(Date.from(now.minusSeconds(10)))
                            .expirationTime(Date.from(grant.invalid().equals("expired") ? now.minusSeconds(600) : now.plusSeconds(300)))
                            .claim("nonce", grant.invalid().equals("nonce") ? "wrong-nonce" : grant.nonce()).build();
                    var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("fixture").build(), claims);
                    jwt.sign(new RSASSASigner(grant.invalid().equals("signature") ? new RSAKeyGenerator(2048).generate() : key));
                    body = mapper.writeValueAsString(Map.of("access_token", "unused-fixture-access", "token_type", "Bearer", "expires_in", 300,
                            "scope", "openid", "id_token", jwt.serialize()));
                } catch (Exception error) { status = 400; body = "{\"error\":\"invalid_grant\"}"; }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
            });
            provider.start();
        } catch (Exception error) { throw new ExceptionInInitializerError(error); }
    }
    @AfterAll static void stopProvider() { provider.stop(0); }
    @TestConfiguration
    static class ProviderConfig {
        @Bean @Primary ClientRegistrationRepository fixtureRegistrations() {
            return new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("google")
                    .clientId("fixture-client").clientSecret("fixture-secret").authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                    .redirectUri("https://jobtracker.test/api/v1/oauth/callback/google").scope("openid")
                    .authorizationUri(issuer + "/authorize").tokenUri(issuer + "/token").jwkSetUri(issuer + "/jwks")
                    .issuerUri(issuer).userNameAttributeName("sub").clientName("Fixture").build());
        }
    }
    @Autowired MockMvc mvc;
    @Autowired MemberService members;
    @Autowired MemberRepository memberRepository;
    @Autowired GoogleAccountService google;
    @Autowired GoogleIdentityRepository identities;
    @Autowired GoogleReauthenticationRepository proofs;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @MockitoBean Clock clock;
    final AtomicReference<Instant> now = new AtomicReference<>();
    @BeforeEach void time() {
        now.set(Instant.now());
        when(clock.instant()).thenAnswer(call -> now.get());
        when(clock.millis()).thenAnswer(call -> now.get().toEpochMilli());
    }
    static Map<String, String> parameters(String query) {
        var result = new HashMap<String, String>();
        for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            result.put(URLDecoder.decode(parts[0], StandardCharsets.UTF_8), parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "");
        }
        return result;
    }
    Member member() { return members.join("g" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), "Test1234", "Google"); }
    SessionPrincipal principal(Member member) { return new SessionPrincipal(member.getId(), memberRepository.findById(member.getId()).orElseThrow().getAuthVersion()); }
    class Browser {
        Cookie cookie;
        MvcResult send(MockHttpServletRequestBuilder request, int expected) throws Exception {
            if (cookie != null) request.cookie(cookie);
            var result = mvc.perform(request).andExpect(status().is(expected)).andReturn();
            var update = result.getResponse().getCookie("SESSION");
            if (update != null) cookie = update.getMaxAge() == 0 ? null : update;
            return result;
        }
        MvcResult write(String path, Object body, int expected) throws Exception { return write("POST", path, body, expected); }
        MvcResult write(String method, String path, Object body, int expected) throws Exception {
            var csrf = mapper.readTree(send(get("/api/v1/members/csrf"), 200).getResponse().getContentAsString());
            return send(request(org.springframework.http.HttpMethod.valueOf(method), "/api/v1" + path)
                    .header(csrf.get("headerName").asText(), csrf.get("token").asText()).contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(body)), expected);
        }
        void login(Member member) throws Exception { write("/members/login", Map.of("username", member.getUsername(), "password", "Test1234"), 200); }
        Map<String, String> begin(String mode) throws Exception {
            write("/oauth/google/start", Map.of("mode", mode, "rememberMe", true, "currentPassword", "Test1234"), 200);
            String url = send(get("/api/v1/oauth/authorize/google"), 302).getResponse().getRedirectedUrl();
            var parameters = parameters(URI.create(url).getRawQuery());
            assertThat(parameters.get("code_challenge_method")).isEqualTo("S256");
            assertThat(parameters.get("nonce")).isNotBlank();
            return parameters;
        }
        String callback(Map<String, String> request, String subject, String invalid) throws Exception {
            String code = UUID.randomUUID().toString();
            grants.put(code, new Grant(subject, request.get("nonce"), request.get("code_challenge"), invalid));
            return send(get("/api/v1/oauth/callback/google").param("code", code).param("state", request.get("state")), 302).getResponse().getRedirectedUrl();
        }
    }

    @Test void existingGoogleIdentityUsesActualCodeExchangeAndAppSession() throws Exception {
        var member = member(); String subject = UUID.randomUUID().toString();
        google.link(principal(member), issuer, subject);
        var browser = new Browser();
        assertThat(browser.callback(browser.begin("LOGIN"), subject, "")).isEqualTo("https://jobtracker.test/");
        var me = browser.send(get("/api/v1/members/me"), 200);
        assertThat(mapper.readTree(me.getResponse().getContentAsString()).get("id").asLong()).isEqualTo(member.getId());
        assertThat(browser.cookie.getMaxAge()).isPositive().isLessThanOrEqualTo(604800);
        jdbc.query("SELECT attribute_bytes FROM spring_session_attributes", rs -> {
            String stored = new String(rs.getBytes(1), StandardCharsets.ISO_8859_1);
            assertThat(stored).doesNotContain("OAuth2AuthenticationToken", "OAuth2AuthorizedClient", "OidcIdToken");
        });
    }
    @Test void newGoogleSignupHasNoPasswordAndNeedsNoRecoveryEmail() throws Exception {
        String subject = UUID.randomUUID().toString(); var browser = new Browser();
        assertThat(browser.callback(browser.begin("LOGIN"), subject, "")).endsWith("/complete-google-signup");
        browser.send(get("/api/v1/members/me"), 401);
        String username = "social" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        browser.write("/oauth/google/complete", Map.of("username", username, "nickname", "Social"), 201);
        var member = memberRepository.findByUsername(username).orElseThrow();
        assertThat(member.getPassword()).isNull(); assertThat(member.getRecoveryEmail()).isNull();
        assertThat(identities.findMemberId(issuer, subject)).contains(member.getId());
        browser.send(get("/api/v1/members/me"), 200);
        assertThatThrownBy(() -> members.login(username, "Test1234")).isInstanceOf(org.springframework.security.authentication.BadCredentialsException.class);
        browser.write("/oauth/google/complete", Map.of("username", username, "nickname", "Social"), 403);
    }
    @Test void invalidSignedClaimsAreRejectedWithoutCreatingAccounts() throws Exception {
        for (String invalid : List.of("nonce", "issuer", "audience", "expired", "signature")) {
            var browser = new Browser(); String subject = UUID.randomUUID().toString();
            assertThat(browser.callback(browser.begin("LOGIN"), subject, invalid)).endsWith("/login?googleError");
            browser.send(get("/api/v1/members/me"), 401);
            assertThat(identities.findMemberId(issuer, subject)).isEmpty();
        }
    }
    @Test void stateMismatchCancellationAndDirectGetCannotAuthenticate() throws Exception {
        var browser = new Browser();
        browser.send(get("/api/v1/oauth/authorize/google"), 404);
        int before = exchanges.get(); var started = browser.begin("LOGIN");
        started.put("state", "wrong-state");
        assertThat(browser.callback(started, "unbound", "")).endsWith("/login?googleError");
        assertThat(exchanges.get()).isEqualTo(before);
        var cancelled = browser.begin("LOGIN");
        assertThat(browser.send(get("/api/v1/oauth/callback/google").param("error", "access_denied").param("state", cancelled.get("state")), 302)
                .getResponse().getRedirectedUrl()).endsWith("/login?googleError");
        browser.send(post("/api/v1/oauth/google/start").contentType(MediaType.APPLICATION_JSON).content("{}"), 403);
    }
    @Test void linkBindsOriginalMemberAndRejectsAccountSwitchDuringRoundTrip() throws Exception {
        var first = member(); var second = member(); var browser = new Browser(); browser.login(first);
        var started = browser.begin("LINK"); browser.login(second);
        assertThat(browser.callback(started, UUID.randomUUID().toString(), "")).endsWith("/login?googleError");
        assertThat(identities.existsById(first.getId())).isFalse(); assertThat(identities.existsById(second.getId())).isFalse();
    }

    @Test void explicitLinkAndUnlinkRevokeSessionsWithoutMergingAnotherMember() throws Exception {
        var member = member(); var other = member(); String subject = UUID.randomUUID().toString();
        var browser = new Browser(); browser.login(member);
        assertThat(browser.callback(browser.begin("LINK"), subject, "")).endsWith("/login?googleLinked");
        browser.send(get("/api/v1/members/me"), 401);
        assertThat(identities.findMemberId(issuer, subject)).contains(member.getId());
        var attacker = new Browser(); attacker.login(other);
        assertThat(attacker.callback(attacker.begin("LINK"), subject, "")).endsWith("/login?googleError");
        assertThat(identities.findMemberId(issuer, subject)).contains(member.getId());
        browser.login(member);
        browser.write("DELETE", "/members/me/google", Map.of("currentPassword", "Test1234"), 204);
        browser.send(get("/api/v1/members/me"), 401);
        assertThat(identities.findMemberId(issuer, subject)).isEmpty();
        assertThat(members.login(member.getUsername(), "Test1234").getId()).isEqualTo(member.getId());
    }
    @Test void reauthenticationIsSingleUseAndPasswordAdditionRevokesSession() throws Exception {
        String subject = UUID.randomUUID().toString();
        var member = google.register(issuer, subject, "np" + UUID.randomUUID().toString().replace("-", "").substring(0,12), "NoPass");
        var browser = new Browser(); browser.callback(browser.begin("LOGIN"), subject, "");
        browser.write("/members/me/google/password", Map.of("newPassword", "Added1234"), 403);
        assertThat(browser.callback(browser.begin("REAUTH"), subject, "")).endsWith("/mypage?googleVerified");
        browser.write("/members/me/google/password", Map.of("newPassword", "Added1234"), 204);
        browser.send(get("/api/v1/members/me"), 401);
        assertThat(members.login(member.getUsername(), "Added1234").getId()).isEqualTo(member.getId());
        assertThat(proofs.findById(member.getId())).isEmpty();
    }
    @Test void lastMethodCannotBeRemovedAndFreshGoogleProofAllowsDeletion() throws Exception {
        String subject = UUID.randomUUID().toString();
        var member = google.register(issuer, subject, "dp" + UUID.randomUUID().toString().replace("-", "").substring(0,12), "Delete");
        var browser = new Browser(); browser.callback(browser.begin("LOGIN"), subject, "");
        browser.write("DELETE", "/members/me/google", Map.of("currentPassword", "Anything123"), 403);
        browser.write("/members/me/google/delete", Map.of(), 403);
        browser.callback(browser.begin("REAUTH"), subject, "");
        browser.write("/members/me/google/delete", Map.of(), 204);
        assertThat(memberRepository.existsById(member.getId())).isFalse();
        assertThat(identities.existsById(member.getId())).isFalse();
    }
    @Test void reauthenticationRejectsDifferentGoogleAccountAndExpiry() throws Exception {
        var member = member(); String subject = UUID.randomUUID().toString(); google.link(principal(member), issuer, subject);
        var browser = new Browser(); browser.login(member);
        assertThat(browser.callback(browser.begin("REAUTH"), "different-subject", "")).endsWith("/login?googleError");
        browser.login(member); browser.callback(browser.begin("REAUTH"), subject, "");
        now.set(now.get().plusSeconds(301));
        browser.write("/members/me/google/delete", Map.of(), 403);
        assertThat(memberRepository.existsById(member.getId())).isTrue();
    }

    @Test void concurrentProofConsumptionHasOneWinnerAndIsBoundToMemberVersion() throws Exception {
        var member = member(); String subject = UUID.randomUUID().toString(); google.link(principal(member), issuer, subject);
        var principal = principal(member); String proof = google.reauthenticate(principal, issuer, subject);
        var other = member();
        assertThatThrownBy(() -> google.consumeProof(principal(other), proof)).isInstanceOf(com.bin.jobtracker.exception.ForbiddenException.class);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task = () -> {
                start.await();
                try { google.consumeProof(principal, proof); return true; }
                catch (com.bin.jobtracker.exception.ForbiddenException expected) { return false; }
            };
            var first = executor.submit(task); var second = executor.submit(task); start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        String next = google.reauthenticate(principal, issuer, subject);
        members.revokeSessions(member.getId());
        assertThatThrownBy(() -> google.consumeProof(principal, next)).isInstanceOf(com.bin.jobtracker.exception.ForbiddenException.class);
    }

    @Test void enrollmentDuplicatesCanBeCorrectedAndExpiredFlowsCannotFinish() throws Exception {
        var existing = member(); var browser = new Browser();
        browser.callback(browser.begin("LOGIN"), UUID.randomUUID().toString(), "");
        browser.write("/oauth/google/complete", Map.of("username", existing.getUsername(), "nickname", "Duplicate"), 409);
        browser.write("/oauth/google/complete", Map.of("username", "correct" + UUID.randomUUID().toString().replace("-", "").substring(0,8), "nickname", "Correct"), 201);
        var expired = new Browser(); expired.callback(expired.begin("LOGIN"), UUID.randomUUID().toString(), "");
        now.set(now.get().plusSeconds(301));
        expired.write("/oauth/google/complete", Map.of("username", "expireduser", "nickname", "Expired"), 403);
        var flow = new Browser(); var started = flow.begin("LOGIN"); now.set(now.get().plusSeconds(601));
        assertThat(flow.callback(started, UUID.randomUUID().toString(), "")).endsWith("/login?googleError");
    }

    @Test void concurrentCodeExchangesKeepEightBrowserIdentitiesSeparated() throws Exception {
        record Flow(Browser browser, Map<String, String> parameters, String subject, Long memberId) {}
        var flows = new ArrayList<Flow>();
        for (int i = 0; i < 8; i++) {
            var member = member();
            String subject = UUID.randomUUID().toString();
            google.link(principal(member), issuer, subject);
            var browser = new Browser();
            flows.add(new Flow(browser, browser.begin("LOGIN"), subject, member.getId()));
        }
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(flows.size())) {
            var futures = new ArrayList<Future<String>>();
            for (var flow : flows) futures.add(executor.submit(() -> {
                start.await();
                assertThat(flow.browser().callback(flow.parameters(), flow.subject(), "")).isEqualTo("https://jobtracker.test/");
                var result = flow.browser().send(get("/api/v1/members/me"), 200);
                assertThat(mapper.readTree(result.getResponse().getContentAsString()).get("id").asLong()).isEqualTo(flow.memberId());
                return flow.browser().cookie.getValue();
            }));
            start.countDown();
            var cookies = new HashSet<String>();
            for (var future : futures) cookies.add(future.get(30, TimeUnit.SECONDS));
            assertThat(cookies).hasSize(flows.size());
        }
    }

    @Test void authorizationStateFromAnotherBrowserCannotAuthenticateEitherAccount() throws Exception {
        var first = new Browser();
        var second = new Browser();
        var firstFlow = first.begin("LOGIN");
        var secondFlow = second.begin("LOGIN");
        int before = exchanges.get();
        assertThat(first.callback(secondFlow, "cross-browser-second", "")).endsWith("/login?googleError");
        assertThat(second.callback(firstFlow, "cross-browser-first", "")).endsWith("/login?googleError");
        first.send(get("/api/v1/members/me"), 401);
        second.send(get("/api/v1/members/me"), 401);
        assertThat(exchanges.get()).isEqualTo(before);
    }

    @Test void completedAuthorizationStateCannotBeReplayedAfterLogout() throws Exception {
        var member = member();
        String subject = UUID.randomUUID().toString();
        google.link(principal(member), issuer, subject);
        var browser = new Browser();
        var flow = browser.begin("LOGIN");
        assertThat(browser.callback(flow, subject, "")).isEqualTo("https://jobtracker.test/");
        browser.write("/members/logout", Map.of(), 204);
        int before = exchanges.get();
        assertThat(browser.callback(flow, subject, "")).endsWith("/login?googleError");
        browser.send(get("/api/v1/members/me"), 401);
        assertThat(exchanges.get()).isEqualTo(before);
    }

    @Test void concurrentGoogleSignupCreatesOneMemberWithoutOrphans() throws Exception {
        String subject = UUID.randomUUID().toString(); long before = memberRepository.count();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task = () -> {
                start.await();
                try { google.register(issuer, subject, "race" + UUID.randomUUID().toString().replace("-", "").substring(0, 10), "Race"); return true; }
                catch (com.bin.jobtracker.exception.ForbiddenException | org.springframework.dao.DataIntegrityViolationException expected) { return false; }
            };
            var first = executor.submit(task); var second = executor.submit(task); start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(memberRepository.count()).isEqualTo(before + 1);
    }
}
