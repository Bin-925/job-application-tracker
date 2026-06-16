package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.ApplicationCreateRequest;
import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.dto.LoginRequest;
import com.bin.jobtracker.enums.ApplicationStatus;
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
@Transactional
class ApiIntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    // 테스트용 비밀번호: 영문+숫자 8자 이상 패턴 만족
    private static final String TEST_PW = "Test1234";

    private void join(String username) throws Exception {
        JoinRequest req = new JoinRequest(username, TEST_PW, username + "닉");
        mockMvc.perform(post("/api/v1/members/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    private String loginAndGetToken(String username) throws Exception {
        LoginRequest req = new LoginRequest(username, TEST_PW);
        String body = mockMvc.perform(post("/api/v1/members/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("accessToken").asText();
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

    @Test
    @DisplayName("회원가입 → 201")
    void join_returns201() throws Exception {
        JoinRequest req = new JoinRequest("testuser", TEST_PW, "테스트");
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
        join("alice1");
        String token = loginAndGetToken("alice1");
        Long appId = createApplication(token);

        mockMvc.perform(get("/api/v1/applications/" + appId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.company").value("토스"));
    }

    @Test
    @DisplayName("★ 남의 지원 조회 시도 → 403")
    void accessOthersApplication_returns403() throws Exception {
        join("alice2");
        String aliceToken = loginAndGetToken("alice2");
        Long appId = createApplication(aliceToken);

        join("bob2");
        String bobToken = loginAndGetToken("bob2");

        mockMvc.perform(get("/api/v1/applications/" + appId)
                        .header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("없는 지원 조회 → 404")
    void getNonExistent_returns404() throws Exception {
        join("alice3");
        String token = loginAndGetToken("alice3");

        mockMvc.perform(get("/api/v1/applications/99999")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
    }
}