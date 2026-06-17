package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.ApplicationCreateRequest;
import com.bin.jobtracker.dto.AvatarUpdateRequest;
import com.bin.jobtracker.dto.JoinRequest;
import com.bin.jobtracker.dto.LoginRequest;
import com.bin.jobtracker.dto.NicknameUpdateRequest;
import com.bin.jobtracker.dto.PasswordUpdateRequest;
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

    @Autowired
    MockMvc mockMvc;
    @Autowired
    ObjectMapper objectMapper;

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
                LocalDate.now(), LocalDate.now().plusDays(7), null, null, "https://toss.im", "메모");
        String body = mockMvc.perform(post("/api/v1/applications")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asLong();
    }

    // ===== 지원(Application) API 테스트 =====

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
// ===== 회원(Member) API 테스트 =====

    @Test
    @DisplayName("★ 내 정보 조회 → 가입 정보 반환")
    void getMe_success() throws Exception {
        join("membera");
        String token = loginAndGetToken("membera");

        mockMvc.perform(get("/api/v1/members/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("membera"))
                .andExpect(jsonPath("$.nickname").value("membera닉"));
    }

    @Test
    @DisplayName("★ 토큰 없이 내 정보 조회 → 401")
    void getMe_withoutToken_returns401() throws Exception {
        mockMvc.perform(get("/api/v1/members/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("★ 닉네임 수정 → 반영됨")
    void updateNickname_success() throws Exception {
        join("memberb");
        String token = loginAndGetToken("memberb");

        String body = objectMapper.writeValueAsString(new NicknameUpdateRequest("새닉네임"));

        mockMvc.perform(patch("/api/v1/members/me/nickname")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("새닉네임"));
    }

    @Test
    @DisplayName("★ 아바타 수정 → 반영됨")
    void updateAvatar_success() throws Exception {
        join("memberc");
        String token = loginAndGetToken("memberc");

        String body = objectMapper.writeValueAsString(new AvatarUpdateRequest("🐱"));

        mockMvc.perform(patch("/api/v1/members/me/avatar")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar").value("🐱"));
    }

    @Test
    @DisplayName("★ 비밀번호 변경 - 현재 비밀번호 틀리면 400")
    void changePassword_wrongCurrent_returns400() throws Exception {
        join("memberd");
        String token = loginAndGetToken("memberd");

        String body = objectMapper.writeValueAsString(
                new PasswordUpdateRequest("WrongPw1", "NewPw1234"));

        mockMvc.perform(patch("/api/v1/members/me/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("★ 비밀번호 변경 성공 → 새 비밀번호로 로그인 가능")
    void changePassword_success() throws Exception {
        join("membere");
        String token = loginAndGetToken("membere");

        String newPw = "NewPw1234";
        String body = objectMapper.writeValueAsString(
                new PasswordUpdateRequest(TEST_PW, newPw));

        mockMvc.perform(patch("/api/v1/members/me/password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNoContent());

        LoginRequest loginReq = new LoginRequest("membere", newPw);
        mockMvc.perform(post("/api/v1/members/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("★ 회원 탈퇴 → 204, 이후 로그인 실패")
    void deleteMember_success() throws Exception {
        join("memberf");
        String token = loginAndGetToken("memberf");

        mockMvc.perform(delete("/api/v1/members/me")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        LoginRequest loginReq = new LoginRequest("memberf", TEST_PW);
        mockMvc.perform(post("/api/v1/members/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isBadRequest());
    }
}