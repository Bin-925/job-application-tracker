package com.bin.jobtracker.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.assertThat;

class ApiRequestGuardFilterTest {
    @Test void unknownLengthBodyCannotBypassLimit() throws Exception {
        var limiter = new AuthRateLimiter(new AuthRateLimitProperties(false, 100, 300, 30, 120, 5, 10, 900));
        var filter = new ApiRequestGuardFilter(limiter, new ObjectMapper(), 1024);
        var request = new MockHttpServletRequest("POST", "/api/v1/applications") {
            @Override public long getContentLengthLong() { return -1; }
            @Override public int getContentLength() { return -1; }
        };
        request.setContent(new byte[1025]);
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();
        filter.doFilter(request, response, chain);
        assertThat(response.getStatus()).isEqualTo(413);
        assertThat(chain.getRequest()).isNull();
    }
}
