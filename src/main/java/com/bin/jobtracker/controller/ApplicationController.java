package com.bin.jobtracker.controller;

import com.bin.jobtracker.dto.ApplicationCreateRequest;
import com.bin.jobtracker.dto.ApplicationResponse;
import com.bin.jobtracker.entity.Application;
import com.bin.jobtracker.service.ApplicationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.util.List;

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

    @GetMapping("/{id}")
    public ApplicationResponse get(@AuthenticationPrincipal Long memberId, @PathVariable Long id) {
        return ApplicationResponse.from(applicationService.getMyApplication(memberId, id));
    }
}