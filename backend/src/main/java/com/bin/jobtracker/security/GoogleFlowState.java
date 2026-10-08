package com.bin.jobtracker.security;

import java.io.Serializable;

public final class GoogleFlowState {
    private GoogleFlowState() {}
    public static final String FLOW = "jobtracker.google.flow";
    public static final String ENROLLMENT = "jobtracker.google.enrollment";
    public static final String PROOF = "jobtracker.google.proof";
    public enum Mode { LOGIN, LINK, REAUTH }
    public record Flow(Mode mode, Long memberId, long authVersion, boolean rememberMe, long expiresAt, String state) implements Serializable {
        public Flow withState(String state) { return new Flow(mode, memberId, authVersion, rememberMe, expiresAt, state); }
    }
    public record Enrollment(String issuer, String subject, boolean rememberMe, long expiresAt) implements Serializable {}
}
