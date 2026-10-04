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

    private org.springframework.test.web.servlet.ResultActions perform(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request.with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf()));
    }

    private void join(String username) throws Exception {
        JoinRequest req = new JoinRequest(username, TEST_PW, username + "닉");
        perform(post("/api/v1/members/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    private String loginAndGetSession(String username) throws Exception {
        LoginRequest req = new LoginRequest(username, TEST_PW, false);
        var response = perform(post("/api/v1/members/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andReturn().getResponse();
        return response.getCookie("SESSION").getValue();
    }

    private Long createApplication(String sessionId) throws Exception {
        ApplicationCreateRequest req = new ApplicationCreateRequest(
                "토스", "백엔드", ApplicationStatus.APPLIED,
                LocalDate.now(), LocalDate.now().plusDays(7), null, null, "https://toss.im", "메모");
        String body = perform(post("/api/v1/applications")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
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
        perform(post("/api/v1/members/join")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("★ 세션 없이 지원 목록 요청 → 401")
    void accessWithoutSession_returns401() throws Exception {
        perform(get("/api/v1/applications"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("★ 가입→로그인→지원 생성→조회 전체 흐름")
    void fullFlow_success() throws Exception {
        join("alice1");
        String sessionId = loginAndGetSession("alice1");
        Long appId = createApplication(sessionId);

        perform(get("/api/v1/applications/" + appId)
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.company").value("토스"));
    }

    @Test
    @DisplayName("★ 남의 지원 조회 시도 → 403")
    void accessOthersApplication_returns403() throws Exception {
        join("alice2");
        String aliceSession = loginAndGetSession("alice2");
        Long appId = createApplication(aliceSession);

        join("bob2");
        String bobSession = loginAndGetSession("bob2");

        perform(get("/api/v1/applications/" + appId)
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", bobSession)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("없는 지원 조회 → 404")
    void getNonExistent_returns404() throws Exception {
        join("alice3");
        String sessionId = loginAndGetSession("alice3");

        perform(get("/api/v1/applications/99999")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)))
                .andExpect(status().isNotFound());
    }
// ===== 회원(Member) API 테스트 =====

    @Test
    @DisplayName("★ 내 정보 조회 → 가입 정보 반환")
    void getMe_success() throws Exception {
        join("membera");
        String sessionId = loginAndGetSession("membera");

        perform(get("/api/v1/members/me")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("membera"))
                .andExpect(jsonPath("$.nickname").value("membera닉"));
    }

    @Test
    @DisplayName("★ 세션 없이 내 정보 조회 → 401")
    void getMe_withoutSession_returns401() throws Exception {
        perform(get("/api/v1/members/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("★ 닉네임 수정 → 반영됨")
    void updateNickname_success() throws Exception {
        join("memberb");
        String sessionId = loginAndGetSession("memberb");

        String body = objectMapper.writeValueAsString(new NicknameUpdateRequest("새닉네임"));

        perform(patch("/api/v1/members/me/nickname")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("새닉네임"));
    }

    @Test
    @DisplayName("★ 아바타 수정 → 반영됨")
    void updateAvatar_success() throws Exception {
        join("memberc");
        String sessionId = loginAndGetSession("memberc");

        String body = objectMapper.writeValueAsString(new AvatarUpdateRequest("🐱"));

        perform(patch("/api/v1/members/me/avatar")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatar").value("🐱"));
    }

    @Test
    @DisplayName("★ 비밀번호 변경 - 현재 비밀번호 틀리면 400")
    void changePassword_wrongCurrent_returns400() throws Exception {
        join("memberd");
        String sessionId = loginAndGetSession("memberd");

        String body = objectMapper.writeValueAsString(
                new PasswordUpdateRequest("WrongPw1", "NewPw1234"));

        perform(patch("/api/v1/members/me/password")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("★ 비밀번호 변경 성공 → 새 비밀번호로 로그인 가능")
    void changePassword_success() throws Exception {
        join("membere");
        String sessionId = loginAndGetSession("membere");

        String newPw = "NewPw1234";
        String body = objectMapper.writeValueAsString(
                new PasswordUpdateRequest(TEST_PW, newPw));

        perform(patch("/api/v1/members/me/password")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isNoContent());

        LoginRequest loginReq = new LoginRequest("membere", newPw, false);
        perform(post("/api/v1/members/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("★ 회원 탈퇴 → 204, 이후 로그인 실패")
    void deleteMember_success() throws Exception {
        join("memberf");
        String sessionId = loginAndGetSession("memberf");

        perform(delete("/api/v1/members/me")
                        .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("currentPassword", TEST_PW))))
                .andExpect(status().isNoContent());

        LoginRequest loginReq = new LoginRequest("memberf", TEST_PW, false);
        perform(post("/api/v1/members/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(loginReq)))
                .andExpect(status().isUnauthorized());
    }
}
