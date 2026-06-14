package com.bin.jobtracker.dto;

import com.bin.jobtracker.enums.ApplicationStatus;

public record StatusCount(ApplicationStatus status, Long count) {}