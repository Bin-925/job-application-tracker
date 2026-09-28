package com.bin.jobtracker.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
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

    private String account(String name) throws Exception {
        String credentials = json.writeValueAsString(Map.of("username", name, "password", "Test1234", "nickname", name));
        mvc.perform(post("/api/v1/members/join").contentType(MediaType.APPLICATION_JSON).content(credentials))
                .andExpect(status().isCreated());
        return json.readTree(mvc.perform(post("/api/v1/members/login").contentType(MediaType.APPLICATION_JSON)
                .content(credentials)).andReturn().getResponse().getContentAsString()).get("accessToken").asText();
    }
    private Long application(String token, boolean legacy) throws Exception {
        var fields = new java.util.HashMap<String, Object>(Map.of("company", "Example", "position", "Backend", "status", "TO_APPLY"));
        if (legacy) fields.put("interviewDate", LocalDate.now().plusDays(1).toString());
        return json.readTree(mvc.perform(post("/api/v1/applications").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(fields)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asLong();
    }
    private String schedule(String title) throws Exception {
        return json.writeValueAsString(Map.of("type", "INTERVIEW", "title", title,
                "date", LocalDate.now().plusDays(1).toString(), "state", "SCHEDULED"));
    }
    private JsonNode add(String token, Long id, String title) throws Exception {
        return json.readTree(mvc.perform(post("/api/v1/applications/" + id + "/schedules")
                .header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(schedule(title))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test void multipleSchedulesHaveIndependentLifecycle() throws Exception {
        String token = account("scheduser");
        Long id = application(token, false);
        add(token, id, "First");
        JsonNode response = add(token, id, "Second");
        assertThat(response.get("schedules")).hasSize(2);
        JsonNode event = response.get("schedules").get(0);
        String path = "/api/v1/applications/" + id + "/schedules/" + event.get("id").asLong();
        var payload = json.createObjectNode().put("type", "INTERVIEW").put("title", "First updated")
                .put("date", LocalDate.now().plusDays(2).toString()).put("state", "COMPLETED")
                .put("version", event.get("version").asLong());
        mvc.perform(put(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isOk());
        mvc.perform(put(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isConflict());
    }

    @Test void otherMemberCannotReadOrMutateSchedules() throws Exception {
        String owner = account("owner11"), stranger = account("other11");
        Long id = application(owner, false);
        Long eventId = add(owner, id, "Private").get("schedules").get(0).get("id").asLong();
        mvc.perform(post("/api/v1/applications/" + id + "/schedules").header("Authorization", "Bearer " + stranger)
                .contentType(MediaType.APPLICATION_JSON).content(schedule("Invalid"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/v1/applications/" + id + "/schedules/" + eventId).header("Authorization", "Bearer " + stranger))
                .andExpect(status().isForbidden());
    }

    @Test void staleApplicationEditDoesNotOverwriteNewerData() throws Exception {
        String token = account("version11");
        Long id = application(token, false);
        var payload = json.createObjectNode().put("company", "Edited").put("position", "Backend")
                .put("status", "TO_APPLY").put("version", 0);
        String path = "/api/v1/applications/" + id;
        mvc.perform(put(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(put(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(payload.toString())).andExpect(status().isConflict());
    }

    @Test void legacyConversionIsAtomicAndDoesNotDuplicate() throws Exception {
        String token = account("legacy11");
        Long id = application(token, true);
        String path = "/api/v1/applications/" + id + "/legacy-schedules/INTERVIEW";
        mvc.perform(put(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(schedule("First interview"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.interviewDate").isEmpty()).andExpect(jsonPath("$.schedules.length()").value(1));
        mvc.perform(put(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(schedule("Duplicate"))).andExpect(status().isNotFound());
    }

    @Test void statusChangeRequiresAppliedDateAndPreservesOriginal() throws Exception {
        String token = account("status11");
        Long id = application(token, false);
        String path = "/api/v1/applications/" + id + "/status";
        mvc.perform(patch(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"APPLIED\"}")).andExpect(status().isBadRequest());
        String day = LocalDate.now().minusDays(3).toString();
        mvc.perform(patch(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", "APPLIED", "appliedDate", day))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.appliedDate").value(day));
        mvc.perform(patch(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("status", "INTERVIEW", "appliedDate", LocalDate.now().toString()))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.appliedDate").value(day)).andExpect(jsonPath("$.schedules.length()").value(0));
    }

    @Test void invalidScheduleAndFutureAppliedDateAreRejected() throws Exception {
        String token = account("valid11");
        Long id = application(token, false);
        mvc.perform(post("/api/v1/applications/" + id + "/schedules").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"INTERVIEW\",\"title\":\"\",\"state\":\"SCHEDULED\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/v1/applications/" + id + "/status").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("status", "APPLIED", "appliedDate", LocalDate.now().plusDays(1).toString()))))
                .andExpect(status().isBadRequest());
    }

    @Test void applicationDeletionCascadesAndAccountDeletionWorksWithData() throws Exception {
        String token = account("delete11");
        Long id = application(token, false);
        add(token, id, "Interview");
        mvc.perform(delete("/api/v1/applications/" + id).header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
        Long second = application(token, false);
        add(token, second, "Interview");
        mvc.perform(delete("/api/v1/members/me").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
    }
}
