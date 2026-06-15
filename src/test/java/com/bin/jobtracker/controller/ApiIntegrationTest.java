package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.ApplicationCreateRequest;
import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.dto.LoginRequest;
import com.bin.jobtracker.enums.ApplicationStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional   // 각 테스트 끝나면 자동 롤백 → DB 깨끗하게 유지
class ApiIntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;   // 스프링이 만든 것(LocalDate 직렬화 가능)

    // --- 헬퍼들 ---
    private void join(String username) throws Exception {
        JoinRequest req = new JoinRequest(username, "password123", username + "_닉");
        mockMvc.perform(post("/api/v1/members/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    private String loginAndGetToken(String username) throws Exception {
        LoginRequest req = new LoginRequest(username, "password123");
        String body = mockMvc.perform(post("/api/v1/members/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("accessToken").asText();   // 응답에서 토큰만 뽑기
    }

    private Long createApplication(String token) throws Exception {
        ApplicationCreateRequest req = new ApplicationCreateRequest(
                "토스", "백엔드", ApplicationStatus.APPLIED,
                LocalDate.now(), LocalDate.now().plusDays(7), "https://toss.im", "메모");
        String body = mockMvc.perform(post("/api/v1/applications")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asLong();
    }

    // --- 테스트들 ---
    @Test
    @DisplayName("회원가입 → 201")
    void join_returns201() throws Exception {
        JoinRequest req = new JoinRequest("alice", "password123", "앨리스");
        mockMvc.perform(post("/api/v1/members/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("★ 토큰 없이 지원 목록 요청 → 401")
    void accessWithoutToken_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/applications"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("★ 가입→로그인→지원 생성→조회 전체 흐름")
    void fullFlow_success() throws Exception {
        join("alice");
        String token = loginAndGetToken("alice");
        Long appId = createApplication(token);

        mockMvc.perform(get("/api/v1/applications/" + appId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.company").value("토스"));
    }

    @Test
    @DisplayName("★ 남의 지원 조회 시도 → 403")
    void accessOthersApplication_returns403() throws Exception {
        join("alice");
        String aliceToken = loginAndGetToken("alice");
        Long appId = createApplication(aliceToken);   // alice가 만든 지원

        join("bob");
        String bobToken = loginAndGetToken("bob");

        mockMvc.perform(get("/api/v1/applications/" + appId)   // bob이 alice 것 접근
                        .header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("없는 지원 조회 → 404")
    void getNonExistent_returns404() throws Exception {
        join("alice");
        String token = loginAndGetToken("alice");

        mockMvc.perform(get("/api/v1/applications/99999")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}
