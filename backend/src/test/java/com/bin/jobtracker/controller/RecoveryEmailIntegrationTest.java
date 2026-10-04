package com.bin.jobtracker.controller;

import com.bin.jobtracker.entity.Member;
import com.bin.jobtracker.repository.MemberRepository;
import com.bin.jobtracker.repository.RecoveryEmailRepository;
import com.bin.jobtracker.service.*;
import com.bin.jobtracker.exception.MailUnavailableException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
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
class RecoveryEmailIntegrationTest {
    static final GreenMail smtp = new GreenMail(new ServerSetup(0, "127.0.0.1", "smtp"));
    static { smtp.start(); }
    @AfterAll static void stopMail() { smtp.stop(); }
    @DynamicPropertySource static void mailProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.mail.host", () -> "127.0.0.1");
        properties.add("spring.mail.port", () -> smtp.getSmtp().getPort());
        properties.add("spring.mail.properties.mail.smtp.timeout", () -> 1000);
        properties.add("spring.mail.properties.mail.smtp.connectiontimeout", () -> 1000);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MemberService members;
    @Autowired MemberRepository memberRepository;
    @Autowired RecoveryEmailService service;
    @Autowired RecoveryEmailRepository tokens;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean Clock clock;
    @MockitoSpyBean RecoveryMailSender mail;
    final AtomicReference<Instant> now = new AtomicReference<>();
    static final String ROOT = "/api/v1/members";
    static final String PASSWORD = "Test1234";
    @BeforeEach void setupClock() {
        now.set(Instant.now());
        when(clock.instant()).thenAnswer(call -> now.get());
        when(clock.millis()).thenAnswer(call -> now.get().toEpochMilli());
    }
    Member member() { return members.join("r" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), PASSWORD, "Recovery"); }
    String email() { return UUID.randomUUID() + "@example.test"; }
    String token(String email) throws Exception {
        var messages = smtp.getReceivedMessages();
        for (int i = messages.length - 1; i >= 0; i--) {
            if (messages[i].getAllRecipients()[0].toString().equalsIgnoreCase(email)) {
                String body = messages[i].getContent().toString();
                var matcher = java.util.regex.Pattern.compile("#token=([A-Za-z0-9_-]{43})").matcher(body);
                if (matcher.find()) return matcher.group(1);
            }
        }
        throw new AssertionError("Verification email missing");
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

    @Test void smtpRequestConfirmPreservesAccountAndRevokesSessions() throws Exception {
        var member = member();
        String email = email();
        var browser = new Browser(); browser.login(member);
        browser.write("/me/recovery-email/requests", Map.of("email", email, "currentPassword", PASSWORD), 204);
        String token = token(email);
        assertThat(tokens.findById(member.getId()).orElseThrow().getTokenHash()).hasSize(64).isNotEqualTo(token);
        assertThat(service.status(member.getId()).verifiedEmail()).isNull();
        assertThat(service.status(member.getId()).pendingEmail()).isEqualTo(email);
        new Browser().write("/recovery-email/confirm", Map.of("token", token), 204);
        browser.send(get(ROOT + "/me"), 401);
        var updated = memberRepository.findById(member.getId()).orElseThrow();
        assertThat(updated.getRecoveryEmail()).isEqualTo(email);
        assertThat(updated.getPassword()).isEqualTo(member.getPassword());
        assertThat(updated.getUsername()).isEqualTo(member.getUsername());
        assertThat(updated.getAuthVersion()).isEqualTo(1);
        assertThat(tokens.findById(member.getId())).isEmpty();
        assertThatThrownBy(() -> service.confirm(token)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void csrfAuthenticationAndPasswordAreRequired() throws Exception {
        var anonymous = new Browser();
        anonymous.write("/me/recovery-email/requests", Map.of("email", email(), "currentPassword", PASSWORD), 401);
        var member = member(); var browser = new Browser(); browser.login(member);
        browser.send(post(ROOT + "/me/recovery-email/requests").contentType(MediaType.APPLICATION_JSON).content("{}"), 403);
        browser.write("/me/recovery-email/requests", Map.of("email", email(), "currentPassword", "Wrong1234"), 403);
        browser.write("/me/recovery-email/requests", Map.of("email", "invalid", "currentPassword", PASSWORD), 400);
        browser.send(get(ROOT + "/me"), 200);
        assertThat(tokens.findById(member.getId())).isEmpty();
        anonymous.send(post(ROOT + "/recovery-email/confirm").contentType(MediaType.APPLICATION_JSON).content("{}"), 403);
        anonymous.write("/recovery-email/confirm", Map.of("token", "x".repeat(44)), 400);
    }
    @Test void getDoesNotConsumeAndLatestLinkWins() throws Exception {
        var member = member(); String email = email();
        service.request(member.getId(), 0, email, PASSWORD); String first = token(email);
        new Browser().send(get(ROOT + "/recovery-email/confirm").param("token", first), 401);
        assertThat(tokens.findById(member.getId())).isPresent();
        assertThatThrownBy(() -> service.request(member.getId(), 0, email, PASSWORD)).isInstanceOf(com.bin.jobtracker.exception.RateLimitException.class);
        now.set(now.get().plusSeconds(61));
        service.request(member.getId(), 0, email, PASSWORD); String second = token(email);
        assertThat(second).isNotEqualTo(first);
        assertThatThrownBy(() -> service.confirm(first)).isInstanceOf(IllegalArgumentException.class);
        assertThat(service.confirm(second)).isEqualTo(member.getId());
    }
    @Test void exactExpiryAndPasswordChangeRejectOutstandingLinks() throws Exception {
        var member = member(); String email = email();
        service.request(member.getId(), 0, email, PASSWORD); String first = token(email);
        now.set(now.get().plusSeconds(1800));
        assertThatThrownBy(() -> service.confirm(first)).isInstanceOf(IllegalArgumentException.class);
        service.request(member.getId(), 0, email, PASSWORD); String second = token(email);
        members.changePassword(member.getId(), PASSWORD, "Other1234");
        assertThatThrownBy(() -> service.confirm(second)).isInstanceOf(IllegalArgumentException.class);
        assertThat(service.status(member.getId()).pendingEmail()).isNull();
    }
    @Test void smtpFailureRollsBackReplacementAndChangeKeepsOldAddressUntilConfirmed() throws Exception {
        var member = member(); String oldEmail = email(), nextEmail = email();
        service.request(member.getId(), 0, oldEmail, PASSWORD); service.confirm(token(oldEmail));
        service.request(member.getId(), 1, nextEmail, PASSWORD); String valid = token(nextEmail);
        assertThat(service.status(member.getId()).verifiedEmail()).isEqualTo(oldEmail);
        now.set(now.get().plusSeconds(61));
        doThrow(new MailUnavailableException()).when(mail).verification(anyString(), anyString());
        assertThatThrownBy(() -> service.request(member.getId(), 1, nextEmail, PASSWORD)).isInstanceOf(MailUnavailableException.class);
        doCallRealMethod().when(mail).verification(anyString(), anyString());
        doThrow(new MailUnavailableException()).when(mail).changed(oldEmail);
        assertThatThrownBy(() -> service.confirm(valid)).isInstanceOf(MailUnavailableException.class);
        assertThat(service.status(member.getId()).verifiedEmail()).isEqualTo(oldEmail);
        doCallRealMethod().when(mail).changed(oldEmail);
        service.confirm(valid);
        assertThat(service.status(member.getId()).verifiedEmail()).isEqualTo(nextEmail);
        assertThat(Arrays.stream(smtp.getReceivedMessages()).anyMatch(message -> {
            try { return message.getAllRecipients()[0].toString().equals(oldEmail) && message.getSubject().contains("변경 안내"); }
            catch (Exception error) { throw new RuntimeException(error); }
        })).isTrue();
    }
    @Test void concurrentConfirmationHasOneWinner() throws Exception {
        var member = member(); String email = email();
        service.request(member.getId(), 0, email, PASSWORD); String token = token(email);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<Boolean> confirm = () -> { start.await(); try { service.confirm(token); return true; } catch (IllegalArgumentException error) { return false; } };
            var first = executor.submit(confirm); var second = executor.submit(confirm); start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(memberRepository.findById(member.getId()).orElseThrow().getAuthVersion()).isEqualTo(1);
    }
    @Test void emailNormalizationDoesNotMergeLocalPartsOrAccounts() throws Exception {
        assertThat(RecoveryEmailService.normalizeEmail(" Ab.C+jobs@EXAMPLE.COM ")).isEqualTo("Ab.C+jobs@example.com");
        assertThatThrownBy(() -> RecoveryEmailService.normalizeEmail("a@example.com\r\nBcc:x@example.com")).isInstanceOf(IllegalArgumentException.class);
        String email = email(); var first = member(); var second = member();
        service.request(first.getId(), 0, email, PASSWORD); service.confirm(token(email));
        service.request(second.getId(), 0, email, PASSWORD); service.confirm(token(email));
        assertThat(memberRepository.findById(first.getId()).orElseThrow().getRecoveryEmail()).isEqualTo(email);
        assertThat(first.getId()).isNotEqualTo(second.getId());
    }
    @Test void disabledMailAndDeletionDoNotLeaveUsableTokens() throws Exception {
        var member = member(); String email = email();
        doReturn(false).when(mail).available();
        var browser = new Browser(); browser.login(member);
        browser.write("/me/recovery-email/requests", Map.of("email", email, "currentPassword", PASSWORD), 503);
        doCallRealMethod().when(mail).available();
        service.request(member.getId(), 0, email, PASSWORD); String token = token(email);
        members.deleteMember(member.getId(), PASSWORD);
        assertThat(tokens.findById(member.getId())).isEmpty();
        assertThatThrownBy(() -> service.confirm(token)).isInstanceOf(IllegalArgumentException.class);
    }
}
