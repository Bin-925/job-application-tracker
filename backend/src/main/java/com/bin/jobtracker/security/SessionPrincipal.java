package com.bin.jobtracker.security;

import java.io.Serializable;
import java.security.Principal;

public record SessionPrincipal(Long memberId, long authVersion) implements Principal, Serializable {
    @Override
    public String getName() { return memberId.toString(); }
}
