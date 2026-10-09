package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.repository.*;
import com.bin.jobtracker.service.*;
import com.bin.jobtracker.exception.MailUnavailableException;
import tools.jackson.databind.ObjectMapper;
import com.icegreen.greenmail.util.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"app.registration-email.required=true", "app.recovery-email.enabled=true",
        "app.recovery-email.from=noreply@jobtracker.test", "app.recovery-email.public-base-url=https://jobtracker.test"})
@AutoConfigureMockMvc
class EmailRegistrationIntegrationTest {
    static final GreenMail smtp = new GreenMail(new ServerSetup(0, "127.0.0.1", "smtp"));
    static { smtp.start(); }
    @AfterAll static void stopMail() { smtp.stop(); }
    @DynamicPropertySource static void mailProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.mail.host", () -> "127.0.0.1");
        properties.add("spring.mail.port", () -> smtp.getSmtp().getPort());
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired RegistrationService service;
    @Autowired RegistrationTokenRepository tokens;
    @Autowired MemberService members;
    @Autowired MemberRepository memberRepository;
    @MockitoBean Clock clock;
    @MockitoSpyBean RecoveryMailSender mail;
    final AtomicReference<Instant> now = new AtomicReference<>();
    static final String ROOT = "/api/v1/members";
    @BeforeEach void setupClock() {
        now.set(Instant.now());
        when(clock.instant()).thenAnswer(call -> now.get());
        when(clock.millis()).thenAnswer(call -> now.get().toEpochMilli());
    }
    String email() { return UUID.randomUUID() + "@example.test"; }
    JoinRequest request() { return new JoinRequest("s" + UUID.randomUUID().toString().replace("-", "").substring(0,12), "Signup123", "Signup"); }
    String token(String email) throws Exception {
        for (var message : smtp.getReceivedMessages()) if (message.getAllRecipients()[0].toString().equalsIgnoreCase(email)) {
            var matcher = java.util.regex.Pattern.compile("/verify-registration#token=([A-Za-z0-9_-]{43})").matcher(message.getContent().toString());
            if (matcher.find()) return matcher.group(1);
        }
        throw new AssertionError("Registration email missing");
    }
    class Browser {
        Cookie cookie;
        MvcResult write(String path, Object body, int expected) throws Exception {
            var csrfRequest = get(ROOT + "/csrf"); if (cookie != null) csrfRequest.cookie(cookie);
            var csrfResponse = mvc.perform(csrfRequest).andExpect(status().isOk()).andReturn().getResponse();
            var update = csrfResponse.getCookie("SESSION"); if (update != null) cookie = update;
            var csrf = json.readTree(csrfResponse.getContentAsString());
            var request = post(ROOT + path).header(csrf.get("headerName").asText(), csrf.get("token").asText())
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
            if (cookie != null) request.cookie(cookie);
            var result = mvc.perform(request).andExpect(status().is(expected)).andReturn();
            update = result.getResponse().getCookie("SESSION"); if (update != null) cookie = update;
            return result;
        }
    }
    @Test void emailFirstCreatesNoMemberUntilConfirmationAndNeverAutoLogsIn() throws Exception {
        String email = email(); var request = request(); long before = memberRepository.count();
        var browser = new Browser(); browser.write("/registration/requests", Map.of("email", email), 202);
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> {
            assertThat(token(email)).hasSize(43);
            assertThat(tokens.findAll()).anyMatch(t -> t.getEmail().equals(email));
        });
        assertThat(memberRepository.count()).isEqualTo(before);
        String token = token(email);
        assertThat(tokens.findAll().stream().filter(t -> t.getEmail().equals(email)).findFirst().orElseThrow().getTokenHash()).hasSize(64).isNotEqualTo(token);
        browser.write("/registration/confirm", Map.of("token", token, "member", request), 201);
        var member = memberRepository.findByUsername(request.username()).orElseThrow();
        assertThat(member.getRecoveryEmail()).isEqualTo(email);
        assertThat(member.getPassword()).isNotEqualTo(request.password());
        mvc.perform(get(ROOT + "/me").cookie(browser.cookie)).andExpect(status().isUnauthorized());
        browser.write("/registration/confirm", Map.of("token", token, "member", request()), 400);
        browser.write("/login", Map.of("username", request.username(), "password", request.password()), 200);
    }
    @Test void legacyJoinIsBlockedButExistingMembersStillLogin() throws Exception {
        var request = request(); var browser = new Browser();
        browser.write("/join", request, 400);
        assertThat(memberRepository.existsByUsername(request.username())).isFalse();
        members.join(request.username(), request.password(), request.nickname());
        browser.write("/login", Map.of("username", request.username(), "password", request.password()), 200);
        mvc.perform(get(ROOT + "/registration/options")).andExpect(status().isOk()).andExpect(jsonPath("$.required").value(true));
    }
    @Test void duplicateUsernameKeepsTokenForCorrectionWithoutMergingExistingAccount() throws Exception {
        String email = email(); var request = request();
        var existing = members.join(request.username(), request.password(), request.nickname());
        existing.verifyRecoveryEmail(email); memberRepository.saveAndFlush(existing);
        service.issue(email); String token = token(email); var browser = new Browser();
        browser.write("/registration/confirm", Map.of("token", token, "member", request), 409);
        var corrected = request();
        browser.write("/registration/confirm", Map.of("token", token, "member", corrected), 201);
        assertThat(memberRepository.findByUsername(corrected.username()).orElseThrow().getId()).isNotEqualTo(existing.getId());
        assertThat(memberRepository.findById(existing.getId()).orElseThrow().getRecoveryEmail()).isEqualTo(email);
    }
    @Test void expiryAndCleanupRemoveOnlyExpiredTokens() throws Exception {
        String email = email(); service.issue(email); String token = token(email);
        now.set(now.get().plusSeconds(1800));
        assertThatThrownBy(() -> service.confirm(token, request())).isInstanceOf(IllegalArgumentException.class);
        String fresh = email(); service.issue(fresh);
        service.cleanExpired();
        assertThat(tokens.findAll()).noneMatch(t -> t.getEmail().equals(email));
        assertThat(tokens.findAll()).anyMatch(t -> t.getEmail().equals(fresh));
    }
    @Test void mailFailureRollsBackTokenAndInvalidInputsRequireCsrf() throws Exception {
        String email = email();
        doThrow(new MailUnavailableException()).when(mail).registration(eq(email), anyString());
        assertThatThrownBy(() -> service.issue(email)).isInstanceOf(MailUnavailableException.class);
        assertThat(tokens.findAll()).noneMatch(t -> t.getEmail().equals(email));
        mvc.perform(post(ROOT + "/registration/requests").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(ROOT + "/registration/confirm").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        var browser = new Browser();
        browser.write("/registration/requests", Map.of("email", "invalid"), 400);
        browser.write("/registration/confirm", Map.of("token", "invalid", "member", request()), 400);
        browser.write("/registration/confirm", Map.of("token", "x".repeat(43), "member", new JoinRequest("!", "short", "")), 400);
    }
    @Test void tokenCannotBeUsedForRecoveryOrReset() throws Exception {
        String email = email(); service.issue(email); String token = token(email); var browser = new Browser();
        browser.write("/recovery-email/confirm", Map.of("token", token), 400);
        browser.write("/password-reset/confirm", Map.of("token", token, "newPassword", "Changed123"), 400);
        browser.write("/registration/confirm", Map.of("token", token, "member", request()), 201);
    }
    @Test void sameTokenConcurrentConfirmationCreatesExactlyOneMember() throws Exception {
        String email = email(); service.issue(email); String token = token(email); long before = memberRepository.count();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task = () -> {
                start.await();
                try { service.confirm(token, request()); return true; }
                catch (IllegalArgumentException invalid) { return false; }
            };
            var first = executor.submit(task); var second = executor.submit(task); start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(memberRepository.count()).isEqualTo(before + 1);
    }
    @Test void differentTokensSameUsernameHaveOneCreatedAndOneConflict() throws Exception {
        String email1 = email(), email2 = email(); service.issue(email1); service.issue(email2);
        String token1 = token(email1), token2 = token(email2); var request = request(); var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var tasks = List.of(token1, token2).stream().map(token -> executor.submit(() -> {
                start.await();
                var csrfResponse = mvc.perform(get(ROOT + "/csrf")).andReturn().getResponse();
                var csrf = json.readTree(csrfResponse.getContentAsString());
                return mvc.perform(post(ROOT + "/registration/confirm").cookie(csrfResponse.getCookie("SESSION"))
                        .header(csrf.get("headerName").asText(), csrf.get("token").asText()).contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("token", token, "member", request))))
                        .andReturn().getResponse().getStatus();
            })).toList();
            start.countDown();
            assertThat(List.of(tasks.get(0).get(10, TimeUnit.SECONDS), tasks.get(1).get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(201, 409);
        }
    }
}
