package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.ApplicationCreateRequest;
import com.bin.jobtracker.dto.ApplicationResponse;
import com.bin.jobtracker.dto.ApplicationUpdateRequest;
import com.bin.jobtracker.dto.StatusUpdateRequest;
import com.bin.jobtracker.entity.Application;
import com.bin.jobtracker.enums.ApplicationStatus;
import com.bin.jobtracker.service.ApplicationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/applications")
@RequiredArgsConstructor
public class ApplicationController {

    private final ApplicationService applicationService;

    @PostMapping
    public ResponseEntity<ApplicationResponse> create(
            @AuthenticationPrincipal Long memberId,
            @RequestBody @Valid ApplicationCreateRequest req) {
        Application app = applicationService.create(memberId, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApplicationResponse.from(app));
    }

    @GetMapping
    public List<ApplicationResponse> list(@AuthenticationPrincipal Long memberId) {
        return applicationService.getMyApplications(memberId);
    }

    @GetMapping("/stats")
    public Map<ApplicationStatus, Long> stats(@AuthenticationPrincipal Long memberId) {
        return applicationService.getStats(memberId);
    }

    @GetMapping("/{id}")
    public ApplicationResponse get(@AuthenticationPrincipal Long memberId, @PathVariable Long id) {
        return ApplicationResponse.from(applicationService.getMyApplication(memberId, id));
    }

    @PutMapping("/{id}")
    public ApplicationResponse update(
            @AuthenticationPrincipal Long memberId,
            @PathVariable Long id,
            @RequestBody @Valid ApplicationUpdateRequest req) {
        return ApplicationResponse.from(applicationService.update(memberId, id, req));
    }

    @PatchMapping("/{id}/status")
    public ApplicationResponse changeStatus(
            @AuthenticationPrincipal Long memberId,
            @PathVariable Long id,
            @RequestBody @Valid StatusUpdateRequest req) {
        return ApplicationResponse.from(applicationService.changeStatus(memberId, id, req));
    }

    @PostMapping("/{id}/schedules")
    @ResponseStatus(HttpStatus.CREATED)
    public ApplicationResponse addSchedule(@AuthenticationPrincipal Long memberId,
            @PathVariable Long id, @RequestBody @Valid com.bin.jobtracker.dto.ScheduleRequest request) {
        return ApplicationResponse.from(applicationService.addSchedule(memberId, id, request));
    }

    @PutMapping("/{id}/schedules/{scheduleId}")
    public ApplicationResponse updateSchedule(@AuthenticationPrincipal Long memberId,
            @PathVariable Long id, @PathVariable Long scheduleId,
            @RequestBody @Valid com.bin.jobtracker.dto.ScheduleRequest request) {
        return ApplicationResponse.from(applicationService.updateSchedule(memberId, id, scheduleId, request));
    }

    @DeleteMapping("/{id}/schedules/{scheduleId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSchedule(@AuthenticationPrincipal Long memberId,
            @PathVariable Long id, @PathVariable Long scheduleId) {
        applicationService.deleteSchedule(memberId, id, scheduleId);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Long memberId,
            @PathVariable Long id) {
        applicationService.delete(memberId, id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/legacy-schedules/{type}")
    public ApplicationResponse replaceLegacy(@AuthenticationPrincipal Long memberId,
            @PathVariable Long id, @PathVariable com.bin.jobtracker.entity.ScheduleEvent.Type type,
            @RequestBody @Valid com.bin.jobtracker.dto.ScheduleRequest request) {
        return ApplicationResponse.from(applicationService.replaceLegacySchedule(memberId, id, type, request));
    }

    @DeleteMapping("/{id}/legacy-schedules/{type}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteLegacy(@AuthenticationPrincipal Long memberId,
            @PathVariable Long id, @PathVariable com.bin.jobtracker.entity.ScheduleEvent.Type type) {
        applicationService.replaceLegacySchedule(memberId, id, type, null);
    }

}
