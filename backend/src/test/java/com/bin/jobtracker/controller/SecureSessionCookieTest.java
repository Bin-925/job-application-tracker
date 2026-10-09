package com.bin.jobtracker.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "app.session.secure=true")
@AutoConfigureMockMvc
class SecureSessionCookieTest {
    @Autowired MockMvc mvc;

    @Test void httpsDeploymentUsesSecureHttpOnlyCookie() throws Exception {
        mvc.perform(get("/api/v1/members/csrf").secure(true)).andExpect(status().isOk())
                .andExpect(cookie().secure("SESSION", true))
                .andExpect(cookie().httpOnly("SESSION", true))
                .andExpect(header().string("Cache-Control", "private, no-store"));
    }
}
