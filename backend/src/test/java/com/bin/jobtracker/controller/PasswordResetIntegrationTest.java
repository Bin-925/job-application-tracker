package com.bin.jobtracker.controller;

import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.repository.*;
import com.bin.jobtracker.service.*;
import com.bin.jobtracker.exception.MailUnavailableException;
import tools.jackson.databind.ObjectMapper;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"app.recovery-email.enabled=true", "app.recovery-email.from=noreply@jobtracker.test",
        "app.recovery-email.public-base-url=https://jobtracker.test"})
@AutoConfigureMockMvc
class PasswordResetIntegrationTest {
    static final GreenMail smtp = new GreenMail(new ServerSetup(0, "127.0.0.1", "smtp"));
    static { smtp.start(); }
    @AfterAll static void stopMail() { smtp.stop(); }
    @DynamicPropertySource static void mailProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.mail.host", () -> "127.0.0.1");
        properties.add("spring.mail.port", () -> smtp.getSmtp().getPort());
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MemberService members;
    @Autowired MemberRepository memberRepository;
    @Autowired PasswordResetService service;
    @Autowired PasswordResetRepository tokens;
    @Autowired RecoveryEmailRepository recoveryTokens;
    @MockitoBean Clock clock;
    @MockitoSpyBean RecoveryMailSender mail;
    @MockitoSpyBean SessionService sessions;
    final AtomicReference<Instant> now = new AtomicReference<>();
    static final String ROOT = "/api/v1/members";
    static final String PASSWORD = "Test1234";
    @BeforeEach void setupClock() {
        now.set(Instant.now());
        when(clock.instant()).thenAnswer(call -> now.get());
        when(clock.millis()).thenAnswer(call -> now.get().toEpochMilli());
    }
    Member member(boolean verified) {
        var member = members.join("p" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), PASSWORD, "Reset");
        if (verified) { member.verifyRecoveryEmail(member.getUsername() + "@example.test"); member = memberRepository.saveAndFlush(member); }
        return member;
    }
    String token(Member member) throws Exception {
        for (var message : smtp.getReceivedMessages()) {
            if (message.getAllRecipients()[0].toString().equalsIgnoreCase(member.getRecoveryEmail())) {
                var matcher = java.util.regex.Pattern.compile("/reset-password#token=([A-Za-z0-9_-]{43})").matcher(message.getContent().toString());
                if (matcher.find()) return matcher.group(1);
            }
        }
        throw new AssertionError("Reset email missing");
    }
    class Browser {
        Cookie cookie;
        MvcResult send(MockHttpServletRequestBuilder request, int expected) throws Exception {
            if (cookie != null) request.cookie(cookie);
            var result = mvc.perform(request).andExpect(status().is(expected)).andReturn();
            var update = result.getResponse().getCookie("SESSION");
            if (update != null) cookie = update.getMaxAge() == 0 ? null : update;
            return result;
        }
        MvcResult write(String path, Object body, int expected) throws Exception {
            var csrf = json.readTree(send(get(ROOT + "/csrf"), 200).getResponse().getContentAsString());
            return send(post(ROOT + path).header(csrf.get("headerName").asText(), csrf.get("token").asText())
                    .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)), expected);
        }
        void login(Member member) throws Exception { write("/login", Map.of("username", member.getUsername(), "password", PASSWORD), 200); }
    }
    @Test void resetsOnceRevokesOtherSessionsAndDoesNotAutoLogin() throws Exception {
        var member = member(true);
        var first = new Browser(); first.login(member);
        var second = new Browser(); second.login(member);
        service.issue(member.getUsername(), member.getRecoveryEmail());
        String token = token(member);
        assertThat(tokens.findById(member.getId()).orElseThrow().getTokenHash()).hasSize(64).isNotEqualTo(token);
        var anonymous = new Browser();
        anonymous.write("/password-reset/confirm", Map.of("token", token, "newPassword", "Changed123"), 204);
        anonymous.send(get(ROOT + "/me"), 401);
        first.send(get(ROOT + "/me"), 401); second.send(get(ROOT + "/me"), 401);
        anonymous.write("/password-reset/confirm", Map.of("token", token, "newPassword", "Changed456"), 400);
        anonymous.write("/login", Map.of("username", member.getUsername(), "password", PASSWORD), 401);
        anonymous.write("/login", Map.of("username", member.getUsername(), "password", "Changed123"), 200);
        assertThat(tokens.findById(member.getId())).isEmpty();
        assertThat(memberRepository.findById(member.getId()).orElseThrow().getId()).isEqualTo(member.getId());
    }
    @Test void requestsReturnSameAcceptedResponseForUnknownWrongAndUnverifiedAccounts() throws Exception {
        var member = member(true); var unverified = member(false); var browser = new Browser();
        for (String username : List.of("absentaccount", member.getUsername(), unverified.getUsername())) {
            var response = browser.write("/password-reset/requests", Map.of("username", username, "email", "wrong@example.test"), 202);
            assertThat(response.getResponse().getContentAsString()).isEmpty();
        }
        service.issue(member.getUsername(), "wrong@example.test");
        service.issue(unverified.getUsername(), "wrong@example.test");
        assertThat(tokens.findById(member.getId())).isEmpty();
        assertThat(tokens.findById(unverified.getId())).isEmpty();
    }
    @Test void acceptedRequestSendsMailAsynchronously() throws Exception {
        var member = member(true);
        new Browser().write("/password-reset/requests", Map.of("username", member.getUsername(), "email", member.getRecoveryEmail()), 202);
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> assertThat(token(member)).hasSize(43));
    }
    @Test void expiryAndAccountChangesInvalidateToken() throws Exception {
        var member = member(true); service.issue(member.getUsername(), member.getRecoveryEmail());
        String token = token(member);
        now.set(now.get().plusSeconds(900));
        assertThatThrownBy(() -> service.confirm(token, "Changed123")).isInstanceOf(IllegalArgumentException.class);
        now.set(now.get().minusSeconds(900));
        members.changePassword(member.getId(), PASSWORD, "Changed456");
        assertThatThrownBy(() -> service.confirm(token, "Changed123")).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void newestLinkWinsAndMailFailurePreservesPreviousLink() throws Exception {
        var member = member(true); service.issue(member.getUsername(), member.getRecoveryEmail());
        String first = token(member);
        service.issue(member.getUsername(), member.getRecoveryEmail());
        assertThatThrownBy(() -> service.confirm(first, "Changed123")).isInstanceOf(IllegalArgumentException.class);
        String latestHash = tokens.findById(member.getId()).orElseThrow().getTokenHash();
        doThrow(new MailUnavailableException()).when(mail).passwordReset(eq(member.getRecoveryEmail()), anyString());
        assertThatThrownBy(() -> service.issue(member.getUsername(), member.getRecoveryEmail())).isInstanceOf(MailUnavailableException.class);
        assertThat(tokens.findById(member.getId()).orElseThrow().getTokenHash()).isEqualTo(latestHash);
    }
    @Test void csrfValidationAndSamePasswordAreRejectedWithoutConsumingToken() throws Exception {
        var member = member(true); service.issue(member.getUsername(), member.getRecoveryEmail());
        String token = token(member); var browser = new Browser();
        browser.send(post(ROOT + "/password-reset/requests").contentType(MediaType.APPLICATION_JSON).content("{}"), 403);
        browser.send(post(ROOT + "/password-reset/confirm").contentType(MediaType.APPLICATION_JSON).content("{}"), 403);
        browser.write("/password-reset/confirm", Map.of("token", token, "newPassword", "short"), 400);
        browser.write("/password-reset/confirm", Map.of("token", token, "newPassword", PASSWORD), 400);
        browser.write("/password-reset/confirm", Map.of("token", "invalid", "newPassword", "Changed123"), 400);
        assertThat(tokens.findById(member.getId())).isPresent();
    }
    @Test void simultaneousConfirmationsHaveExactlyOneWinner() throws Exception {
        var member = member(true); service.issue(member.getUsername(), member.getRecoveryEmail());
        String token = token(member);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task = () -> {
                start.await();
                try { service.confirm(token, "Changed123"); return true; }
                catch (IllegalArgumentException invalid) { return false; }
            };
            var first = executor.submit(task); var second = executor.submit(task); start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
    }
    @Test void accountDeletionRemovesResetTokens() {
        var member = member(true); service.issue(member.getUsername(), member.getRecoveryEmail());
        members.deleteMember(member.getId(), PASSWORD);
        assertThat(tokens.findById(member.getId())).isEmpty();
    }

    @Test void committedVersionRejectsSessionWhenPhysicalCleanupFails() throws Exception {
        var member = member(true); var browser = new Browser(); browser.login(member);
        service.issue(member.getUsername(), member.getRecoveryEmail());
        doThrow(new IllegalStateException("simulated cleanup failure")).when(sessions).deleteAll(member.getId());
        new Browser().write("/password-reset/confirm", Map.of("token", token(member), "newPassword", "Changed123"), 204);
        browser.send(get(ROOT + "/me"), 401);
    }

    @Test void emailChangesInvalidateOldLinkAndRecoveryPurposeRejectsResetToken() throws Exception {
        var member = member(true); service.issue(member.getUsername(), member.getRecoveryEmail());
        String token = token(member);
        new Browser().write("/recovery-email/confirm", Map.of("token", token), 400);
        assertThat(tokens.findById(member.getId())).isPresent();
        var updated = memberRepository.findById(member.getId()).orElseThrow();
        updated.verifyRecoveryEmail("changed@example.test"); memberRepository.saveAndFlush(updated);
        new Browser().write("/password-reset/confirm", Map.of("token", token, "newPassword", "Changed123"), 400);
    }
}
