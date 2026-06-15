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
        return ApplicationResponse.from(applicationService.changeStatus(memberId, id, req.status()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Long memberId,
            @PathVariable Long id) {
        applicationService.delete(memberId, id);
        return ResponseEntity.noContent().build();
    }
}