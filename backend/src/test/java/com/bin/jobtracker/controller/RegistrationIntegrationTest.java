package com.bin.jobtracker.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RegistrationIntegrationTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @SpyBean BCryptPasswordEncoder encoder;

    private class Browser {
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
        private String header;
        private String token;

        Browser() throws Exception {
            var csrf = json.readTree(send("GET", "/members/csrf", null).body());
            header = csrf.get("headerName").asText();
            token = csrf.get("token").asText();
        }

        HttpResponse<String> send(String method, String path, Map<String, Object> body) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path))
                    .timeout(Duration.ofSeconds(20));
            if (token != null) request.header(header, token);
            if (body != null) request.header("Content-Type", "application/json");
            return client.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private Map<String, Object> registration() {
        return Map.of("username", "audit" + UUID.randomUUID().toString().replace("-", "").substring(0, 10),
                "password", "Audit1234!", "nickname", "Audit");
    }

    @Test void simultaneousSignupReturnsOneCreatedAndOneConflict() throws Exception {
        var first = new Browser();
        var second = new Browser();
        var payload = registration();
        // Both requests must pass the advisory existence check before either inserts.
        var encodeGate = new CyclicBarrier(2);
        doAnswer(invocation -> {
            encodeGate.await(10, TimeUnit.SECONDS);
            return invocation.callRealMethod();
        }).when(encoder).encode(any(CharSequence.class));
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> first.send("POST", "/members/join", payload));
            var b = executor.submit(() -> second.send("POST", "/members/join", payload));
            var responseA = a.get(25, TimeUnit.SECONDS);
            var responseB = b.get(25, TimeUnit.SECONDS);
            assertThat(java.util.List.of(responseA.statusCode(), responseB.statusCode())).containsExactlyInAnyOrder(201, 409);
            var rejected = responseA.statusCode() == 409 ? responseA : responseB;
            assertThat(json.readTree(rejected.body()).get("message").asText()).isEqualTo("이미 사용 중인 아이디입니다.");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM member WHERE username = ?", Integer.class, payload.get("username"))).isEqualTo(1);
            assertThat(first.send("POST", "/members/login", payload).statusCode()).isEqualTo(200);
        }
    }

    @Test void sequentialDuplicateHasSameConflictResponse() throws Exception {
        var browser = new Browser();
        var payload = registration();
        assertThat(browser.send("POST", "/members/join", payload).statusCode()).isEqualTo(201);
        var duplicate = browser.send("POST", "/members/join", payload);
        assertThat(duplicate.statusCode()).isEqualTo(409);
        assertThat(json.readTree(duplicate.body()).get("message").asText()).isEqualTo("이미 사용 중인 아이디입니다.");
    }
}
