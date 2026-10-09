package com.bin.jobtracker.controller;

import org.springframework.boot.autoconfigure.condition.ConditionalOnResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnResource(resources = "classpath:/static/index.html")
public class SpaController {
    // Only actual browser routes receive the shell, never arbitrary file/API paths.
    @GetMapping(value = {"/", "/login", "/join", "/verify-registration", "/complete-google-signup",
            "/verify-email", "/forgot-password", "/reset-password", "/applications", "/applications/new",
            "/applications/{id:[0-9]+}", "/applications/{id:[0-9]+}/edit", "/calendar", "/mypage",
            "/mypage/account", "/mypage/account/password", "/notifications"}, produces = MediaType.TEXT_HTML_VALUE)
    public Resource page() { return new ClassPathResource("static/index.html"); }
}
