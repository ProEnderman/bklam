package com.restaurant.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import jakarta.servlet.Filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CSRF endpoint and refresh POST: GET /api/auth/csrf succeeds; POST /api/auth/refresh without client token
 * returns 401 (no refresh cookie) and/or 403 when CSRF rejects the request.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CsrfIT {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private FilterChainProxy filterChainProxy;

    @Test
    void getCsrfEndpointSucceeds() throws Exception {
        mvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isString())
                .andExpect(jsonPath("$.headerName").value("X-XSRF-TOKEN"))
                .andExpect(jsonPath("$.parameterName").value("_csrf"));
    }

    @Test
    void postWithoutCsrfTokenReturns401Or403BeforeSuccessPath() throws Exception {
        // Without refresh cookie, refresh endpoint returns 401. When CSRF runs first, missing X-XSRF-TOKEN yields 403.
        MockHttpSession session = new MockHttpSession();
        mvc.perform(get("/api/auth/csrf").session(session)).andExpect(status().isOk());
        int status = mvc.perform(post("/api/auth/refresh").session(session).contentType(MediaType.APPLICATION_JSON))
                .andReturn()
                .getResponse()
                .getStatus();
        assertThat(status).as("expect CSRF rejection (403) or missing refresh cookie (401)").isIn(401, 403);
    }

    @Test
    void csrfIgnoredMatchersMustNotMatchRefreshPost() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/refresh");
        for (RequestMatcher m : SecurityConfig.csrfIgnoredMatchers()) {
            assertThat(m.matches(req))
                    .as("CSRF must not ignore POST /api/auth/refresh: matcher=%s", m)
                    .isFalse();
        }
    }

    @Test
    void securityChainForPostRefreshIncludesCsrfFilter() {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/refresh");
        boolean found = false;
        for (SecurityFilterChain chain : filterChainProxy.getFilterChains()) {
            if (!chain.matches(req)) {
                continue;
            }
            for (Filter f : chain.getFilters()) {
                if (f instanceof CsrfFilter) {
                    found = true;
                    break;
                }
            }
            if (found) {
                break;
            }
        }
        assertThat(found).as("POST /api/auth/refresh should use a chain that includes CsrfFilter").isTrue();
    }
}
