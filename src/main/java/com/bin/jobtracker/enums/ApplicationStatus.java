package com.bin.jobtracker.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ApplicationStatus {
    TO_APPLY("지원예정"),
    APPLIED("지원완료"),
    DOC_PASSED("서류합격"),
    INTERVIEW("면접"),
    ACCEPTED("최종합격"),
    REJECTED("불합격");

    private final String label;
}
