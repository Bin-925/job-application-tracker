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

@RestController
@RequestMapping("/api/v1/applications")
@RequiredArgsConstructor
public class ApplicationController {

    private final ApplicationService applicationService;

    @PostMapping
    public ResponseEntity<ApplicationResponse> create(
            @AuthenticationPrincipal Long memberId,            // ⭐ 토큰에서 자동으로 본인 id
            @RequestBody @Valid ApplicationCreateRequest req) {
        Application app = applicationService.create(memberId, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApplicationResponse.from(app));
    }
}
