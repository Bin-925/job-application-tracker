package com.bin.jobtracker.controller;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ScheduleIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private org.springframework.test.web.servlet.ResultActions perform(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf()));
    }

    private String account(String name) throws Exception {
        String credentials = json.writeValueAsString(Map.of("username", name, "password", "Test1234", "nickname", name));
        perform(post("/api/v1/members/join").contentType(MediaType.APPLICATION_JSON).content(credentials))
                .andExpect(status().isCreated());
        return perform(post("/api/v1/members/login").contentType(MediaType.APPLICATION_JSON)
                .content(credentials)).andExpect(status().isOk()).andReturn().getResponse().getCookie("SESSION").getValue();
    }
    private Long application(String sessionId, boolean legacy) throws Exception {
        var fields = new java.util.HashMap<String, Object>(Map.of("company", "Example", "position", "Backend", "status", "TO_APPLY"));
        if (legacy) fields.put("interviewDate", LocalDate.now().plusDays(1).toString());
        return json.readTree(perform(post("/api/v1/applications").cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(fields)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asLong();
    }
    private String schedule(String title) throws Exception {
        return json.writeValueAsString(Map.of("type", "INTERVIEW", "title", title,
                "date", LocalDate.now().plusDays(1).toString(), "state", "SCHEDULED"));
    }
    private JsonNode add(String sessionId, Long id, String title) throws Exception {
        return json.readTree(perform(post("/api/v1/applications/" + id + "/schedules")
                .cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(schedule(title))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test void multipleSchedulesHaveIndependentLifecycle() throws Exception {
        String sessionId = account("scheduser");
        Long id = application(sessionId, false);
        add(sessionId, id, "First");
        JsonNode response = add(sessionId, id, "Second");
        assertThat(response.get("schedules")).hasSize(2);
        JsonNode event = response.get("schedules").get(0);
        String path = "/api/v1/applications/" + id + "/schedules/" + event.get("id").asLong();
        var payload = json.createObjectNode().put("type", "INTERVIEW").put("title", "First updated")
                .put("date", LocalDate.now().plusDays(2).toString()).put("state", "COMPLETED")
                .put("version", event.get("version").asLong());
        perform(put(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isOk());
        perform(put(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isConflict());
    }

    @Test void otherMemberCannotReadOrMutateSchedules() throws Exception {
        String owner = account("owner11"), stranger = account("other11");
        Long id = application(owner, false);
        Long eventId = add(owner, id, "Private").get("schedules").get(0).get("id").asLong();
        perform(post("/api/v1/applications/" + id + "/schedules").cookie(new jakarta.servlet.http.Cookie("SESSION", stranger))
                .contentType(MediaType.APPLICATION_JSON).content(schedule("Invalid"))).andExpect(status().isForbidden());
        perform(delete("/api/v1/applications/" + id + "/schedules/" + eventId).cookie(new jakarta.servlet.http.Cookie("SESSION", stranger)))
                .andExpect(status().isForbidden());
    }

    @Test void staleApplicationEditDoesNotOverwriteNewerData() throws Exception {
        String sessionId = account("version11");
        Long id = application(sessionId, false);
        var payload = json.createObjectNode().put("company", "Edited").put("position", "Backend")
                .put("status", "TO_APPLY").put("version", 0);
        String path = "/api/v1/applications/" + id;
        perform(put(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        perform(put(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isConflict());
    }

    @Test void legacyConversionIsAtomicAndDoesNotDuplicate() throws Exception {
        String sessionId = account("legacy11");
        Long id = application(sessionId, true);
        String path = "/api/v1/applications/" + id + "/legacy-schedules/INTERVIEW";
        perform(put(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(schedule("First interview"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.interviewDate").isEmpty()).andExpect(jsonPath("$.schedules.length()").value(1));
        perform(put(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(schedule("Duplicate"))).andExpect(status().isNotFound());
    }

    @Test void statusChangeRequiresAppliedDateAndPreservesOriginal() throws Exception {
        String sessionId = account("status11");
        Long id = application(sessionId, false);
        String path = "/api/v1/applications/" + id + "/status";
        perform(patch(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"APPLIED\",\"version\":0}")).andExpect(status().isBadRequest());
        String day = LocalDate.now().minusDays(3).toString();
        perform(patch(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", "APPLIED", "appliedDate", day, "version", 0))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.appliedDate").value(day));
        perform(patch(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", "INTERVIEW", "appliedDate", LocalDate.now().toString(), "version", 1))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.appliedDate").value(day)).andExpect(jsonPath("$.schedules.length()").value(0));
    }

    @Test void invalidScheduleAndFutureAppliedDateAreRejected() throws Exception {
        String sessionId = account("valid11");
        Long id = application(sessionId, false);
        perform(post("/api/v1/applications/" + id + "/schedules").cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"INTERVIEW\",\"title\":\"\",\"state\":\"SCHEDULED\"}"))
                .andExpect(status().isBadRequest());
        perform(patch("/api/v1/applications/" + id + "/status").cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("status", "APPLIED", "appliedDate", LocalDate.now().plusDays(1).toString(), "version", 0))))
                .andExpect(status().isBadRequest());
    }

    @Test void staleStatusCannotOverwriteNewerStatus() throws Exception {
        String sessionId = account("ststatus");
        Long id = application(sessionId, false);
        String path = "/api/v1/applications/" + id;
        var cookie = new jakarta.servlet.http.Cookie("SESSION", sessionId);
        String day = LocalDate.now().minusDays(1).toString();
        perform(patch(path + "/status").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", "ACCEPTED", "appliedDate", day, "version", 0))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        perform(patch(path + "/status").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", "INTERVIEW", "appliedDate", day, "version", 0))))
                .andExpect(status().isConflict());
        perform(get(path).cookie(cookie)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED")).andExpect(jsonPath("$.version").value(1));
        perform(patch(path + "/status").cookie(cookie).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", "INTERVIEW", "version", 1))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
    }

    @Test void statusRequiresNonnegativeVersion() throws Exception {
        String sessionId = account("stversion");
        Long id = application(sessionId, false);
        String path = "/api/v1/applications/" + id + "/status";
        for (String payload : java.util.List.of("{\"status\":\"TO_APPLY\"}",
                "{\"status\":\"TO_APPLY\",\"version\":-1}")) {
            perform(patch(path).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                    .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isBadRequest());
        }
    }

    @Test void applicationDeletionCascadesAndAccountDeletionWorksWithData() throws Exception {
        String sessionId = account("delete11");
        Long id = application(sessionId, false);
        add(sessionId, id, "Interview");
        perform(delete("/api/v1/applications/" + id).cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))).andExpect(status().isNoContent());
        Long second = application(sessionId, false);
        add(sessionId, second, "Interview");
        perform(delete("/api/v1/members/me").cookie(new jakarta.servlet.http.Cookie("SESSION", sessionId))
                .contentType(MediaType.APPLICATION_JSON).content("{\"currentPassword\":\"Test1234\"}"))
                .andExpect(status().isNoContent());
    }
}
