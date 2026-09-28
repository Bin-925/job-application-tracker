package com.bin.jobtracker.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"app.rate-limit.enabled=true", "app.rate-limit.requests-per-ip-per-minute=4",
        "app.rate-limit.attempts-per-account=2", "app.request.max-body-bytes=2048"})
@AutoConfigureMockMvc
class RequestGuardIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test void accountLimitSurvivesChangingIpAndReturnsWaitTime() throws Exception {
        String name = "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        String payload = "{\"username\":\"" + name + "\",\"password\":\"Wrong1234\"}";
        for (int i = 0; i < 2; i++) mvc.perform(post("/api/v1/members/login").with(csrf())
                .with(request -> { request.setRemoteAddr(UUID.randomUUID().toString()); return request; })
                .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/members/login").with(csrf())
                .with(request -> { request.setRemoteAddr("another-ip"); return request; })
                .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.status").value(429));
    }

    @Test void forwardedHeaderCannotResetIpBudgetAndCsrfRemainsRequired() throws Exception {
        String peer = UUID.randomUUID().toString();
        for (int i = 0; i < 4; i++) mvc.perform(post("/api/v1/members/login")
                .with(request -> { request.setRemoteAddr(peer); return request; })
                .header("X-Forwarded-For", "198.51.100." + i)
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/members/login")
                .with(request -> { request.setRemoteAddr(peer); return request; })
                .header("X-Forwarded-For", "203.0.113.200")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"))
                .andExpect(header().string("Cache-Control", "private, no-store"));
    }

    @Test void oversizedBodyIsRejectedBeforeCsrfCreatesWork() throws Exception {
        mvc.perform(post("/api/v1/applications").contentType(MediaType.APPLICATION_JSON).content("x".repeat(2049)))
                .andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.status").value(413));
    }

    @Test void passwordLengthAndMalformedJsonFailWithBadRequest() throws Exception {
        String ip = UUID.randomUUID().toString();
        mvc.perform(post("/api/v1/members/login").with(csrf())
                .with(request -> { request.setRemoteAddr(ip); return request; })
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"student\",\"password\":\"" + "a".repeat(73) + "\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/members/login").with(csrf())
                .with(request -> { request.setRemoteAddr(ip); return request; })
                .contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest());
    }
}
