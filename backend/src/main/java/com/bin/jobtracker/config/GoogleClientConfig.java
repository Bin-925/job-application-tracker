package com.bin.jobtracker.config;

import com.bin.jobtracker.security.GoogleProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.AuthorizationGrantType;

@Configuration
@ConditionalOnProperty(name = "app.google.enabled", havingValue = "true")
public class GoogleClientConfig {
    @Bean
    ClientRegistrationRepository googleClientRegistration(GoogleProperties properties) {
        return new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("google")
                .clientId(properties.clientId()).clientSecret(properties.clientSecret())
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(properties.publicOrigin() + "/api/v1/oauth/callback/google")
                .scope("openid").authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .tokenUri("https://oauth2.googleapis.com/token").issuerUri("https://accounts.google.com")
                .jwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                .userInfoUri("https://openidconnect.googleapis.com/v1/userinfo").userNameAttributeName("sub")
                .clientName("Google").build());
    }
}
