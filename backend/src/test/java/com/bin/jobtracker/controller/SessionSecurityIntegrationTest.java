package com.bin.jobtracker.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.bin.jobtracker.security.SessionPolicy;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.util.Map;
import java.util.UUID;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SessionSecurityIntegrationTest {
    private static final String ROOT = "/api/v1/members";
    private static final String PASSWORD = "Test1234";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired SessionRepository<?> sessions;

    // No mock authentication or csrf() postprocessor: exercise the browser protocol.
    private class Browser {
        Cookie cookie;
        String csrf;
        MvcResult send(MockHttpServletRequestBuilder request, int status) throws Exception {
            if (cookie != null) request.cookie(cookie);
            var result = mvc.perform(request).andExpect(status().is(status)).andReturn();
            var updated = result.getResponse().getCookie("SESSION");
            if (updated != null) cookie = updated.getMaxAge() == 0 ? null : updated;
            return result;
        }
        void fetchCsrf() throws Exception {
            csrf = body(send(get(ROOT + "/csrf"), 200)).get("token").asText();
        }
        MvcResult write(MockHttpServletRequestBuilder request, Object payload, int status) throws Exception {
            fetchCsrf();
            return send(request.header("X-CSRF-TOKEN", csrf).contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(payload)), status);
        }
        void login(String name, String password) throws Exception {
            write(post(ROOT + "/login"), Map.of("username", name, "password", password), 200);
        }
        MvcResult login(String name, boolean rememberMe) throws Exception {
            return write(post(ROOT + "/login"), Map.of("username", name, "password", PASSWORD, "rememberMe", rememberMe), 200);
        }
    }
    private JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString());
    }
    private String join(Browser browser) throws Exception {
        String name = "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        browser.write(post(ROOT + "/join"), Map.of("username", name, "password", PASSWORD, "nickname", "Tester"), 201);
        return name;
    }
    private Browser loggedIn() throws Exception {
        var browser = new Browser();
        browser.login(join(browser), PASSWORD);
        return browser;
    }

    private String sessionId(Browser browser) {
        return new String(Base64.getDecoder().decode(browser.cookie.getValue()), StandardCharsets.UTF_8);
    }

    private <S extends Session> void updateSession(SessionRepository<S> repository, Browser browser, Consumer<Session> edit) {
        S session = repository.findById(sessionId(browser));
        edit.accept(session);
        repository.save(session);
    }

    @Test void anonymousAndLoginWithoutOptionUseShortSessionPolicy() throws Exception {
        var browser = new Browser();
        browser.fetchCsrf();
        assertThat(browser.cookie.getMaxAge()).isEqualTo(-1);
        assertThat(sessions.findById(sessionId(browser)).getMaxInactiveInterval()).isEqualTo(SessionPolicy.SHORT_IDLE);
        browser.login(join(browser), PASSWORD);
        var session = sessions.findById(sessionId(browser));
        assertThat(browser.cookie.getMaxAge()).isEqualTo(-1);
        assertThat(session.getMaxInactiveInterval()).isEqualTo(SessionPolicy.SHORT_IDLE);
        assertThat((Boolean) session.getAttribute(SessionPolicy.REMEMBER_ME)).isFalse();
        assertThat((Long) session.getAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT)
                - (Long) session.getAttribute(SessionPolicy.AUTHENTICATED_AT)).isEqualTo(SessionPolicy.SHORT_ABSOLUTE.toMillis());
    }

    @Test void rememberedLoginSurvivesNewBrowserAndDoesNotExtendAbsoluteDeadline() throws Exception {
        var first = new Browser();
        String name = join(first);
        first.login(name, true);
        assertThat(first.cookie.getMaxAge()).isBetween(604790, 604800);
        var session = sessions.findById(sessionId(first));
        assertThat(session.getMaxInactiveInterval()).isEqualTo(SessionPolicy.REMEMBERED);
        Long deadline = session.getAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT);
        var reopened = new Browser();
        reopened.cookie = first.cookie;
        reopened.send(get(ROOT + "/me"), 200);
        reopened.fetchCsrf();
        assertThat((Long) sessions.findById(sessionId(reopened)).getAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT)).isEqualTo(deadline);
        assertThat(reopened.cookie.getMaxAge()).isBetween(604790, 604800);
    }

    @Test void loggingInWithoutRetentionReplacesPersistentCookieAndRotatesSession() throws Exception {
        var browser = new Browser();
        String name = join(browser);
        browser.login(name, true);
        Cookie remembered = browser.cookie;
        browser.login(name, false);
        assertThat(browser.cookie.getValue()).isNotEqualTo(remembered.getValue());
        assertThat(browser.cookie.getMaxAge()).isEqualTo(-1);
        mvc.perform(get(ROOT + "/me").cookie(remembered)).andExpect(status().isUnauthorized());
        browser.send(get(ROOT + "/me"), 200);
    }

    @Test void absoluteExpiryRejectsBothModesEvenWithRecentActivityAndValidCsrf() throws Exception {
        for (boolean remembered : new boolean[]{false, true}) {
            var browser = new Browser();
            browser.login(join(browser), remembered);
            browser.fetchCsrf();
            var session = sessions.findById(sessionId(browser));
            long expiry = System.currentTimeMillis() - 1;
            long lifetime = (remembered ? SessionPolicy.REMEMBERED : SessionPolicy.SHORT_ABSOLUTE).toMillis();
            updateSession(sessions, browser, stored -> {
                stored.setAttribute(SessionPolicy.AUTHENTICATED_AT, expiry - lifetime);
                stored.setAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT, expiry);
            });
            var rejected = browser.send(patch(ROOT + "/me/nickname").header("X-CSRF-TOKEN", browser.csrf)
                    .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"NotSaved\"}"), 401);
            assertThat(rejected.getResponse().getCookie("SESSION").getMaxAge()).isZero();
            assertThat(sessions.findById(session.getId())).isNull();
        }
    }

    @Test void legacySessionsWithoutPolicyMustLoginAgain() throws Exception {
        var browser = loggedIn();
        updateSession(sessions, browser, stored -> stored.removeAttribute(SessionPolicy.ABSOLUTE_EXPIRES_AT));
        var rejected = browser.send(get(ROOT + "/me"), 401);
        assertThat(rejected.getResponse().getCookie("SESSION").getMaxAge()).isZero();
        browser.fetchCsrf();
        assertThat(browser.cookie.getMaxAge()).isEqualTo(-1);
    }

    @Test void loginRotatesIdAndCsrfAndDoesNotExposeCredentials() throws Exception {
        var browser = new Browser();
        String name = join(browser);
        browser.fetchCsrf();
        Cookie before = browser.cookie;
        String oldCsrf = browser.csrf;
        var login = browser.send(post(ROOT + "/login").header("X-CSRF-TOKEN", oldCsrf)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("username", name, "password", PASSWORD))), 200);
        assertThat(browser.cookie.getValue()).isNotEqualTo(before.getValue());
        assertThat(browser.cookie.isHttpOnly()).isTrue();
        assertThat(login.getResponse().getHeader("Set-Cookie")).contains("SameSite=Lax", "Path=/");
        assertThat(body(login).has("accessToken")).isFalse();
        assertThat(body(login).has("password")).isFalse();
        assertThat(login.getResponse().getHeader("Cache-Control")).contains("no-store");
        mvc.perform(get(ROOT + "/me").cookie(before)).andExpect(status().isUnauthorized());
        browser.send(patch(ROOT + "/me/nickname").header("X-CSRF-TOKEN", oldCsrf)
                .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"Changed\"}"), 403);
        browser.write(patch(ROOT + "/me/nickname"), Map.of("nickname", "Changed"), 200);
        Long id = body(browser.send(get(ROOT + "/me"), 200)).get("id").asLong();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME = ?",
                Integer.class, id.toString())).isEqualTo(1);
    }

    @Test void unsafeRequestsRequireCsrfIncludingLoginAndLogout() throws Exception {
        mvc.perform(post(ROOT + "/join").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(ROOT + "/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        var browser = loggedIn();
        browser.send(post(ROOT + "/logout"), 403);
        browser.send(delete(ROOT + "/me"), 403);
        browser.send(post("/api/v1/applications").contentType(MediaType.APPLICATION_JSON).content("{}"), 403);
        browser.send(get(ROOT + "/me"), 200);
    }

    @Test void avatarUpdateIsBoundToCurrentMemberAndValidatesInputAndCsrf() throws Exception {
        var first = loggedIn();
        var second = loggedIn();
        long other = body(second.send(get(ROOT + "/me"), 200)).get("id").asLong();
        first.send(patch(ROOT + "/me/avatar").contentType(MediaType.APPLICATION_JSON).content("{\"avatar\":\"green\"}"), 403);
        first.write(patch(ROOT + "/me/avatar"), Map.of("avatar", " "), 400);
        first.write(patch(ROOT + "/me/avatar"), Map.of("avatar", "x".repeat(33)), 400);
        var changed = body(first.write(patch(ROOT + "/me/avatar"), Map.of("avatar", "green", "memberId", other), 200));
        assertThat(changed.get("avatar").asText()).isEqualTo("green");
        assertThat(body(first.send(get(ROOT + "/me"), 200)).get("avatar").asText()).isEqualTo("green");
        assertThat(body(second.send(get(ROOT + "/me"), 200)).get("avatar").asText()).isEqualTo("blue");
        var anonymous = new Browser();
        anonymous.write(patch(ROOT + "/me/avatar"), Map.of("avatar", "green"), 401);
    }

    @Test void logoutInvalidatesCookieAndReplay() throws Exception {
        var browser = loggedIn();
        Cookie previous = browser.cookie;
        var result = browser.write(post(ROOT + "/logout"), Map.of(), 204);
        assertThat(result.getResponse().getCookie("SESSION").getMaxAge()).isZero();
        mvc.perform(get(ROOT + "/me").cookie(previous)).andExpect(status().isUnauthorized());
        browser.send(get(ROOT + "/me"), 401);
    }

    @Test void logoutAllRevokesTwoIndependentDevices() throws Exception {
        var first = new Browser();
        String name = join(first);
        first.login(name, PASSWORD);
        var second = new Browser();
        second.login(name, true);
        Cookie old = first.cookie;
        first.write(post(ROOT + "/logout-all"), Map.of(), 204);
        mvc.perform(get(ROOT + "/me").cookie(old)).andExpect(status().isUnauthorized());
        second.send(get(ROOT + "/me"), 401);
        second.login(name, PASSWORD);
        second.send(get(ROOT + "/me"), 200);
    }

    @Test void passwordChangeRevokesBothDevicesAndOldPassword() throws Exception {
        var first = new Browser();
        String name = join(first);
        first.login(name, PASSWORD);
        var second = new Browser();
        second.login(name, true);
        Cookie old = first.cookie;
        first.write(patch(ROOT + "/me/password"), Map.of("currentPassword", PASSWORD, "newPassword", "Newpass1234"), 204);
        mvc.perform(get(ROOT + "/me").cookie(old)).andExpect(status().isUnauthorized());
        second.send(get(ROOT + "/me"), 401);
        first.write(post(ROOT + "/login"), Map.of("username", name, "password", PASSWORD), 401);
        first.login(name, "Newpass1234");
        first.send(get(ROOT + "/me"), 200);
    }

    @Test void wrongCurrentPasswordPreservesSessions() throws Exception {
        var browser = loggedIn();
        browser.write(patch(ROOT + "/me/password"), Map.of("currentPassword", "Wrong1234", "newPassword", "Newpass1234"), 400);
        browser.write(delete(ROOT + "/me"), Map.of("currentPassword", "Wrong1234"), 400);
        browser.write(delete(ROOT + "/me"), Map.of(), 400);
        browser.send(get(ROOT + "/me"), 200);
    }

    @Test void accountDeletionRevokesOtherDevices() throws Exception {
        var first = new Browser();
        String name = join(first);
        first.login(name, PASSWORD);
        var second = new Browser();
        second.login(name, true);
        first.write(delete(ROOT + "/me"), Map.of("currentPassword", PASSWORD), 204);
        second.send(get(ROOT + "/me"), 401);
        first.write(post(ROOT + "/login"), Map.of("username", name, "password", PASSWORD), 401);
    }

    @Test void revisionCheckRejectsSessionsThatOutliveRepositoryCleanup() throws Exception {
        var browser = loggedIn();
        Long id = body(browser.send(get(ROOT + "/me"), 200)).get("id").asLong();
        jdbc.update("UPDATE member SET auth_version = auth_version + 1 WHERE id = ?", id);
        var rejected = browser.send(get(ROOT + "/me"), 401);
        assertThat(rejected.getResponse().getHeader("Cache-Control")).contains("no-store");
    }

    @Test void expiredSessionsAreRejectedWithoutWaitingForCleanupJob() throws Exception {
        var browser = loggedIn();
        Long id = body(browser.send(get(ROOT + "/me"), 200)).get("id").asLong();
        jdbc.update("UPDATE SPRING_SESSION SET LAST_ACCESS_TIME = 0, EXPIRY_TIME = 0 WHERE PRINCIPAL_NAME = ?", id.toString());
        browser.send(get(ROOT + "/me"), 401);
    }

    @Test void unknownAndWrongPasswordHaveSamePublicResponse() throws Exception {
        var browser = new Browser();
        String name = join(browser);
        var wrong = body(browser.write(post(ROOT + "/login"), Map.of("username", name, "password", "Wrong1234"), 401));
        var missing = body(browser.write(post(ROOT + "/login"), Map.of("username", "nobody9999999999", "password", "Wrong1234"), 401));
        assertThat(wrong.get("message")).isEqualTo(missing.get("message"));
        browser.send(get(ROOT + "/me"), 401);
    }

    @Test void untrustedCorsAndLegacyBearerAreRejected() throws Exception {
        mvc.perform(options(ROOT + "/login").header("Origin", "https://untrusted.vercel.app")
                .header("Access-Control-Request-Method", "POST")).andExpect(status().isForbidden());
        mvc.perform(options(ROOT + "/login").header("Origin", "http://127.0.0.1:5173")
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "X-CSRF-TOKEN"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(get(ROOT + "/me").header("Authorization", "Bearer legacy-token"))
                .andExpect(status().isUnauthorized());
    }
}
