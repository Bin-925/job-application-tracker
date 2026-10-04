package com.bin.jobtracker.security;

import com.bin.jobtracker.repository.MemberRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

public class SessionValidityFilter extends OncePerRequestFilter {
    private final MemberRepository members;
    private final SessionPolicy policy;
    public SessionValidityFilter(MemberRepository members, SessionPolicy policy) {
        this.members = members;
        this.policy = policy;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof SessionPrincipal principal) {
            // A DB revision also rejects old sessions that race with session deletion.
            boolean valid = policy.isValid(request.getSession(false)) && members.findById(principal.memberId())
                    .map(member -> member.getAuthVersion() == principal.authVersion()).orElse(false);
            if (!valid) {
                SecurityContextHolder.clearContext();
                var session = request.getSession(false);
                if (session != null) session.invalidate();
                response.setStatus(401);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"status\":401,\"message\":\"로그인이 만료되었습니다.\"}");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
