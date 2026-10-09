package com.bin.jobtracker.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class PublicWebIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void browserRoutesArePublicButContainNoPrivateData() throws Exception {
        for (String path : new String[]{"/", "/calendar", "/applications/12/edit", "/reset-password", "/complete-google-signup"}) {
            mvc.perform(get(path).accept(MediaType.TEXT_HTML)).andExpect(status().isOk())
                    .andExpect(content().string(containsString("test-shell")))
                    .andExpect(header().string("Cache-Control", "private, no-store"))
                    .andExpect(header().doesNotExist("Set-Cookie"));
        }
    }

    @Test void apiAndMissingResourcesNeverBecomeTheSpa() throws Exception {
        mvc.perform(get("/api/v1/applications")).andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
        for (String path : new String[]{"/.well-known/assetlinks.json", "/assets/missing.js"}) {
            mvc.perform(get(path).accept(MediaType.TEXT_HTML)).andExpect(status().isNotFound())
                    .andExpect(content().string(not(containsString("test-shell"))));
        }
        mvc.perform(get("/api/v1/oauth/callback/google")).andExpect(content().string(not(containsString("test-shell"))));
        mvc.perform(post("/calendar")).andExpect(status().isForbidden());
    }

    @Test void onlyFingerprintAssetsGetLongCache() throws Exception {
        mvc.perform(get("/assets/contract-12345678.js")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"));
        mvc.perform(get("/api/v1/members/csrf")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "private, no-store"));
    }

    @Test void probesExposeOnlyStatusAndDoNotCreateSessions() throws Exception {
        mvc.perform(get("/livez").cookie(new jakarta.servlet.http.Cookie("SESSION", "stale-cookie")))
                .andExpect(status().isOk()).andExpect(content().json("{\"status\":\"UP\"}"))
                .andExpect(jsonPath("$.components").doesNotExist()).andExpect(header().doesNotExist("Set-Cookie"));
        mvc.perform(get("/readyz")).andExpect(status().isOk()).andExpect(jsonPath("$.details").doesNotExist());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/health")).andExpect(status().isUnauthorized());
    }
}
