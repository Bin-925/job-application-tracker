package com.bin.jobtracker.security;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("app.rate-limit")
public record AuthRateLimitProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("10000") @Min(100) int maxEntries,
        @DefaultValue("300") @Min(1) int globalRequestsPerMinute,
        @DefaultValue("30") @Min(1) int requestsPerIpPerMinute,
        @DefaultValue("120") @Min(1) int csrfRequestsPerIpPerMinute,
        @DefaultValue("5") @Min(1) int registrationsPerIp,
        @DefaultValue("10") @Min(1) int attemptsPerAccount,
        @DefaultValue("900") @Min(1) @Max(1800) int accountWindowSeconds
) {}
