package com.bin.jobtracker.security;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class GooglePropertiesTest {
    @Test void disabledConfigurationNeedsNoCredentialsAndDoesNotEnableRoutes() {
        var properties = new GoogleProperties(false, null, null, null, false);
        assertThatThrownBy(properties::requireEnabled).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void enabledConfigurationRequiresTrustedOriginAndNeverPrintsSecret() {
        for (String origin : java.util.List.of("http://external.test", "https://example.test/", "https://example.test?next=bad", "https://name@example.test")) {
            assertThatThrownBy(() -> new GoogleProperties(true, "client", "fixture-secret", origin, false)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(new GoogleProperties(true, "client", "fixture-secret", "https://example.test", false).toString()).doesNotContain("fixture-secret");
        assertThatCode(() -> new GoogleProperties(true, "client", "fixture-secret", "http://127.0.0.1:5173", true)).doesNotThrowAnyException();
    }
}
