package com.bin.jobtracker.security;

import com.bin.jobtracker.exception.RateLimitException;
import tools.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;

public class ApiRequestGuardFilter extends OncePerRequestFilter {
    private static final Set<String> WRITES = Set.of("POST", "PUT", "PATCH", "DELETE");
    private final AuthRateLimiter limiter;
    private final ObjectMapper json;
    private final int maxBodyBytes;

    public ApiRequestGuardFilter(AuthRateLimiter limiter, ObjectMapper json, int maxBodyBytes) {
        if (maxBodyBytes < 1024 || maxBodyBytes > 1_048_576) throw new IllegalArgumentException("Invalid API body limit");
        this.limiter = limiter;
        this.json = json;
        this.maxBodyBytes = maxBodyBytes;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String path = request.getServletPath();
        if (path.isEmpty()) path = request.getRequestURI().substring(request.getContextPath().length());
        if (!path.startsWith("/api/")) { chain.doFilter(request, response); return; }
        try {
            // Forwarded headers are only usable after a trusted proxy/container has validated them.
            limiter.checkRequest(request.getRemoteAddr(), path, request.getMethod());
        } catch (RateLimitException error) {
            response.setHeader("Retry-After", Long.toString(error.getRetryAfterSeconds()));
            reject(response, 429, error.getMessage());
            return;
        }
        if (WRITES.contains(request.getMethod())) {
            if (request.getContentLengthLong() > maxBodyBytes) {
                reject(response, 413, "요청 내용이 너무 큽니다.");
                return;
            }
            // Read at most one byte beyond the limit, including chunked requests with no known length.
            byte[] body = request.getInputStream().readNBytes(maxBodyBytes + 1);
            if (body.length > maxBodyBytes) {
                reject(response, 413, "요청 내용이 너무 큽니다.");
                return;
            }
            chain.doFilter(new BufferedRequest(request, body), response);
            return;
        }
        chain.doFilter(request, response);
    }

    private void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Cache-Control", "private, no-store");
        json.writeValue(response.getOutputStream(), Map.of("status", status, "message", message));
    }

    private static class BufferedRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        BufferedRequest(HttpServletRequest request, byte[] body) { super(request); this.body = body; }
        @Override public int getContentLength() { return body.length; }
        @Override public long getContentLengthLong() { return body.length; }
        @Override public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
        @Override public ServletInputStream getInputStream() {
            var stream = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return stream.read(); }
                @Override public int read(byte[] bytes, int offset, int length) { return stream.read(bytes, offset, length); }
                @Override public boolean isFinished() { return stream.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) {
                    throw new IllegalStateException("This JSON API uses synchronous request-body reads");
                }
            };
        }
    }
}
